"""Mouser order API (v1) integration: a purchase's shopping cart at Mouser.

The cart/order API uses a different API key than the search API, so it lives
in the supplier's ``api_config`` under ``order_api``::

    {"order_api": {"provider": "mouser", "api_key": "...",
                   "country_code": "CZ", "currency_code": "EUR"}}

The cart key is kept in ``Purchase.metadata["mouser_cart"]`` so the cart can be
re-read, updated and compared with the purchase later.

TODO: import an existing Mouser cart into a new purchase (the reverse direction):
read it with ``fetch_mouser_cart`` style ``GET /cart?cartKey=...``, match
MouserPartNumber to SupplierRelation.symbol and create the purchase items.
"""
from typing import Any, Dict, List, Optional

import requests
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from nextintranet_warehouse.models.purchase import Purchase, PurchaseItemType

CART_URL = "https://api.mouser.com/api/v1/cart"
# POST /cart replaces an existing cart and demands a real CartKey. Inserting items
# without a CartKey is what makes Mouser create a new cart and return its key.
CART_INSERT_URL = "https://api.mouser.com/api/v1/cart/items/insert"
EMPTY_CART_KEY = "00000000-0000-0000-0000-000000000000"
CART_WEB_URL = "https://www.mouser.com/Cart/"
METADATA_KEY = "mouser_cart"


def get_order_api_config(supplier) -> Optional[Dict[str, Any]]:
    cfg = (supplier.api_config or {}).get("order_api")
    if isinstance(cfg, dict) and cfg.get("provider") == "mouser" and cfg.get("api_key"):
        return cfg
    return None


def supplier_has_mouser_cart(supplier) -> bool:
    return get_order_api_config(supplier) is not None


def get_cart_metadata(purchase: Purchase) -> Dict[str, Any]:
    return (purchase.metadata or {}).get(METADATA_KEY) or {}


def _require_config(purchase: Purchase) -> Dict[str, Any]:
    cfg = get_order_api_config(purchase.supplier)
    if not cfg:
        raise ValidationError({"detail": "Supplier has no Mouser order API configured (api_config.order_api)."})
    return cfg


def _params(cfg: Dict[str, Any], purchase: Purchase, **extra) -> Dict[str, Any]:
    params = {"apiKey": cfg["api_key"], **extra}
    if cfg.get("country_code"):
        params["countryCode"] = cfg["country_code"]
    currency = cfg.get("currency_code") or purchase.currency
    if currency:
        params["currencyCode"] = currency
    return params


def _call(method: str, url: str, **kwargs) -> Dict[str, Any]:
    try:
        response = requests.request(method, url, timeout=30, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as exc:
        # Never echo the URL: it carries the API key.
        raise ValidationError({"detail": f"Mouser request failed: HTTP {exc.response.status_code}: {exc.response.text[:300]}"})
    except requests.RequestException as exc:
        raise ValidationError({"detail": f"Mouser request failed: {exc.__class__.__name__}"})
    except ValueError:
        raise ValidationError({"detail": "Mouser returned invalid JSON."})


def _errors(data: Dict[str, Any]) -> List[str]:
    errors = [
        f'{e.get("PropertyName")}: {e.get("Message")}' if e.get("PropertyName") else (e.get("Message") or "Unknown error")
        for e in (data.get("Errors") or [])
    ]
    # Per-line problems (unknown part number, ...) come back on the cart items.
    for line in data.get("CartItems") or []:
        for e in line.get("Errors") or []:
            errors.append(f'{line.get("MouserPartNumber")}: {e.get("Message") or e.get("Code")}')
    return errors


def _cart_summary(data: Dict[str, Any], errors: List[str]) -> Dict[str, Any]:
    return {
        "cart_key": data.get("CartKey"),
        "currency_code": data.get("CurrencyCode"),
        "total_item_count": data.get("TotalItemCount"),
        "merchandise_total": data.get("MerchandiseTotal"),
        "errors": errors,
        "cart_url": CART_WEB_URL,
    }


def _purchase_lines(purchase: Purchase) -> List[Dict[str, Any]]:
    lines = []
    for item in purchase.items.filter(item_type=PurchaseItemType.COMPONENT):
        symbol = (item.symbol or "").strip()
        if not symbol:
            raise ValidationError({"detail": f"Item {item.id} has no Mouser part number."})
        lines.append({"MouserPartNumber": symbol, "Quantity": int(item.quantity)})
    if not lines:
        raise ValidationError({"detail": "Purchase has no component items."})
    return lines


def sync_mouser_cart(purchase: Purchase) -> Dict[str, Any]:
    """Create the cart at Mouser, or overwrite the linked one with the current items."""
    cfg = _require_config(purchase)
    lines = _purchase_lines(purchase)
    linked = get_cart_metadata(purchase).get("cart_key")

    if linked:
        data = _call("POST", CART_URL, params=_params(cfg, purchase),
                     json={"CartKey": linked, "CartItems": lines})
    else:
        data = _call("POST", CART_INSERT_URL, params=_params(cfg, purchase),
                     json={"CartItems": lines})

    errors = _errors(data)
    cart_key = data.get("CartKey")
    if not cart_key or cart_key == EMPTY_CART_KEY:
        detail = "; ".join(errors) if errors else "no cart was created"
        raise ValidationError({"detail": f"Mouser did not create the cart: {detail}"})

    metadata = dict(purchase.metadata or {})
    metadata[METADATA_KEY] = {
        "cart_key": cart_key,
        "currency_code": data.get("CurrencyCode"),
        "synced_at": timezone.now().isoformat(),
    }
    purchase.metadata = metadata
    purchase.save(update_fields=["metadata"])

    result = _cart_summary(data, errors)
    result["created"] = not linked
    return result


def fetch_mouser_cart(purchase: Purchase) -> Dict[str, Any]:
    """Read the linked cart from Mouser and compare it with the purchase items."""
    cfg = _require_config(purchase)
    cart_key = get_cart_metadata(purchase).get("cart_key")
    if not cart_key:
        raise ValidationError({"detail": "This purchase has no Mouser cart yet."})

    data = _call("GET", CART_URL, params=_params(cfg, purchase, cartKey=cart_key))
    errors = _errors(data)

    cart_lines: Dict[str, Dict[str, Any]] = {}
    for line in data.get("CartItems") or []:
        key = (line.get("MouserPartNumber") or "").strip().upper()
        cart_lines[key] = {
            "part_number": line.get("MouserPartNumber"),
            "manufacturer_part_number": line.get("MfrPartNumber"),
            "quantity": line.get("Quantity"),
            "unit_price": line.get("UnitPrice"),
            "extended_price": line.get("ExtendedPrice"),
            "stock": line.get("MouserATS"),
        }

    purchase_qty: Dict[str, int] = {}
    for item in purchase.items.filter(item_type=PurchaseItemType.COMPONENT):
        key = (item.symbol or "").strip().upper()
        purchase_qty[key] = purchase_qty.get(key, 0) + int(item.quantity)

    only_in_cart = [cart_lines[k] for k in cart_lines if k not in purchase_qty]
    only_in_purchase = [{"part_number": k, "quantity": q} for k, q in purchase_qty.items() if k not in cart_lines]
    quantity_differs = [
        {**cart_lines[k], "purchase_quantity": q}
        for k, q in purchase_qty.items()
        if k in cart_lines and cart_lines[k]["quantity"] != q
    ]

    result = _cart_summary(data, errors)
    result.update({
        "lines": list(cart_lines.values()),
        "in_sync": not (only_in_cart or only_in_purchase or quantity_differs),
        "only_in_cart": only_in_cart,
        "only_in_purchase": only_in_purchase,
        "quantity_differs": quantity_differs,
        "synced_at": get_cart_metadata(purchase).get("synced_at"),
    })
    return result


def unlink_mouser_cart(purchase: Purchase) -> None:
    metadata = dict(purchase.metadata or {})
    if metadata.pop(METADATA_KEY, None) is not None:
        purchase.metadata = metadata
        purchase.save(update_fields=["metadata"])
