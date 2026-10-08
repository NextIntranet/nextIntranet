"""Stock availability per warehouse: what is on hand, what is reserved, what is free.

Single source of truth for "how many can I use, and where". Physical stock comes from
stocked packets; reservations come from registered providers. Manual reservations (the
`Reservation` table) are one provider; other apps (production) register their own in
`AppConfig.ready()`. Where a reservation comes from is only a label on the entry — every
consumer sees one "reserved" figure.

A warehouse is a location with `is_warehouse`. A location belongs to its nearest
ancestor-or-self warehouse; stock outside any warehouse is reported under the `None` key.
Reservations without a warehouse (legacy rows) hold stock in every warehouse.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Iterable, Protocol

from django.db.models import DecimalField, Expression, Sum, Value
from django.db.models.functions import Cast, Coalesce


_DECIMAL = DecimalField(max_digits=20, decimal_places=6)


@dataclass(frozen=True)
class ReservationEntry:
    source: str
    ref_id: str
    component_id: Any
    warehouse_id: Any
    quantity: float
    label: str = ""
    meta: dict = field(default_factory=dict, compare=False, hash=False)

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "ref_id": self.ref_id,
            "label": self.label,
            "warehouse_id": str(self.warehouse_id) if self.warehouse_id else None,
            "quantity": self.quantity,
            **self.meta,
        }


class ReservationProvider(Protocol):
    source: str

    def entries(self, component_ids: Iterable) -> Iterable[ReservationEntry]:
        """Active reservation entries for the given components."""

    def total_subquery(self) -> Expression:
        """Total reserved for `OuterRef('pk')` (a Component), across all warehouses."""


_providers: dict[str, ReservationProvider] = {}


def register_reservation_provider(provider: ReservationProvider) -> None:
    _providers[provider.source] = provider


def reservation_providers() -> list[ReservationProvider]:
    return list(_providers.values())


class ManualReservationProvider:
    source = "manual"

    def entries(self, component_ids):
        from ..models.component import Reservation

        for reservation in Reservation.objects.active().filter(component_id__in=component_ids):
            yield ReservationEntry(
                source=self.source,
                ref_id=str(reservation.id),
                component_id=reservation.component_id,
                warehouse_id=reservation.warehouse_id,
                quantity=float(reservation.quantity or 0),
                label=reservation.description or reservation.reserved_by or "",
                meta={
                    "reservation_id": str(reservation.id),
                    "reserved_by": reservation.reserved_by,
                    "priority": reservation.priority,
                    "expiration_date": reservation.expiration_date.isoformat()
                    if reservation.expiration_date
                    else None,
                },
            )

    def total_subquery(self):
        from django.db.models import OuterRef, Subquery

        from ..models.component import Reservation

        return Subquery(
            Reservation.objects.active()
            .filter(component=OuterRef("pk"))
            .values("component")
            .annotate(s=Sum("quantity"))
            .values("s")[:1]
        )


register_reservation_provider(ManualReservationProvider())


# --------------------------------------------------------------------------- #
# Warehouses
# --------------------------------------------------------------------------- #

def _warehouse_rows() -> dict[Any, dict]:
    from ..models.warehouse import Warehouse

    rows = Warehouse.objects.filter(is_warehouse=True).values("id", "name", "tree_id", "lft", "rght", "level")
    return {row["id"]: row for row in rows}


def warehouses() -> dict[Any, dict]:
    """All warehouses as {id: {id, name, full_path}}, ordered by full path."""
    from ..models.warehouse import Warehouse

    rows = _warehouse_rows()
    result = {}
    for row in rows.values():
        names = Warehouse.objects.filter(
            tree_id=row["tree_id"], lft__lte=row["lft"], rght__gte=row["rght"]
        ).order_by("lft").values_list("name", flat=True)
        result[row["id"]] = {"id": str(row["id"]), "name": row["name"], "full_path": "/".join(names)}
    return dict(sorted(result.items(), key=lambda item: item[1]["full_path"]))


class WarehouseResolver:
    """Maps a location (by its MPTT coordinates) to the nearest enclosing warehouse."""

    def __init__(self, warehouse_rows: dict[Any, dict] | None = None):
        self.rows = warehouse_rows if warehouse_rows is not None else _warehouse_rows()
        self._by_tree: dict[int, list[dict]] = {}
        for row in self.rows.values():
            self._by_tree.setdefault(row["tree_id"], []).append(row)
        for candidates in self._by_tree.values():
            # Deepest first, so the first match is the nearest enclosing warehouse.
            candidates.sort(key=lambda r: -r["level"])

    def resolve(self, tree_id: int | None, lft: int | None) -> Any:
        if tree_id is None or lft is None:
            return None
        for row in self._by_tree.get(tree_id, ()):
            if row["lft"] <= lft <= row["rght"]:
                return row["id"]
        return None


def warehouse_of_location(location) -> Any:
    if location is None:
        return None
    warehouse = location.warehouse
    return warehouse.id if warehouse else None


def default_warehouse_for_user(user) -> Any:
    """The user's home-location warehouse, or the only warehouse if there is exactly one."""
    from nextintranet_backend.models.userSettings import UserSetting

    from ..models.warehouse import Warehouse

    if user is not None and getattr(user, "is_authenticated", False):
        settings = UserSetting.objects.filter(user=user).select_related("home_location").first()
        if settings and settings.home_location:
            warehouse_id = warehouse_of_location(settings.home_location)
            if warehouse_id:
                return warehouse_id
    ids = list(Warehouse.objects.filter(is_warehouse=True).values_list("id", flat=True)[:2])
    return ids[0] if len(ids) == 1 else None


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #

@dataclass
class WarehouseStock:
    warehouse_id: Any
    on_hand: float = 0.0
    reservations: list[ReservationEntry] = field(default_factory=list)

    @property
    def reserved(self) -> float:
        return sum(entry.quantity for entry in self.reservations)

    @property
    def free(self) -> float:
        return self.on_hand - self.reserved

    def as_dict(self) -> dict:
        return {
            "warehouse_id": str(self.warehouse_id) if self.warehouse_id else None,
            "on_hand": self.on_hand,
            "reserved": self.reserved,
            "free": self.free,
            "reservations": [entry.as_dict() for entry in self.reservations],
        }


@dataclass
class ComponentAvailability:
    component_id: Any
    # Stock and warehouse-scoped reservations per warehouse; None = stock outside any warehouse.
    stock: dict[Any, WarehouseStock] = field(default_factory=dict)
    # Reservations without a warehouse: they hold stock in every warehouse.
    unscoped: list[ReservationEntry] = field(default_factory=list)

    def _bucket(self, warehouse_id):
        return self.stock.setdefault(warehouse_id, WarehouseStock(warehouse_id))

    def in_warehouse(self, warehouse_id: Any) -> WarehouseStock:
        bucket = self.stock.get(warehouse_id) or WarehouseStock(warehouse_id)
        if warehouse_id is None:
            return bucket
        return WarehouseStock(warehouse_id, bucket.on_hand, [*bucket.reservations, *self.unscoped])

    def warehouse_ids(self) -> list:
        return [wid for wid in self.stock if wid is not None]

    @property
    def on_hand(self) -> float:
        return sum(bucket.on_hand for bucket in self.stock.values())

    @property
    def reserved(self) -> float:
        return sum(bucket.reserved for bucket in self.stock.values()) + sum(e.quantity for e in self.unscoped)

    @property
    def free(self) -> float:
        return self.on_hand - self.reserved


def component_availability(
    component_ids: Iterable,
    exclude: set[tuple[str, str]] | None = None,
    resolver: WarehouseResolver | None = None,
) -> dict[Any, ComponentAvailability]:
    """Per-component, per-warehouse on hand / reserved / free.

    `exclude` drops reservation entries by `(source, ref_id)` — used so a BOM line does not
    compete with its own reservation.
    """
    from ..models.component import Packet, PacketState

    component_ids = [cid for cid in component_ids if cid is not None]
    result = {cid: ComponentAvailability(cid) for cid in component_ids}
    if not component_ids:
        return result
    resolver = resolver or WarehouseResolver()
    exclude = exclude or set()

    packets = Packet.objects.filter(component_id__in=component_ids, state=PacketState.STOCKED).values(
        "component_id", "location__tree_id", "location__lft", "count"
    )
    for row in packets:
        availability = result.get(row["component_id"])
        if availability is None:
            continue
        warehouse_id = resolver.resolve(row["location__tree_id"], row["location__lft"])
        availability._bucket(warehouse_id).on_hand += float(row["count"] or 0)

    for provider in reservation_providers():
        for entry in provider.entries(component_ids):
            if (entry.source, entry.ref_id) in exclude or entry.quantity <= 0:
                continue
            availability = result.get(entry.component_id)
            if availability is None:
                continue
            if entry.warehouse_id is None:
                availability.unscoped.append(entry)
            else:
                availability._bucket(entry.warehouse_id).reservations.append(entry)

    return result


def component_totals(component_ids: Iterable) -> dict[Any, dict[str, float]]:
    """{component_id: {on_hand, reserved}} across all warehouses."""
    return {
        cid: {"on_hand": availability.on_hand, "reserved": availability.reserved}
        for cid, availability in component_availability(component_ids).items()
    }


def reserved_total_annotation() -> Expression:
    """Annotation for a Component queryset: everything reserved for it, across all sources."""
    expression = Value(Decimal("0"), output_field=_DECIMAL)
    for provider in reservation_providers():
        expression = expression + Coalesce(
            Cast(provider.total_subquery(), output_field=_DECIMAL),
            Value(Decimal("0")),
            output_field=_DECIMAL,
        )
    return expression
