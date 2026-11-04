"""Mouser order API (v1) integration: create a cart from a purchase.

The cart/order API uses a different API key than the search API, so it lives
in the supplier's ``api_config`` under ``order_api``::

    {"order_api": {"provider": "mouser", "api_key": "...",
                   "country_code": "CZ", "currency_code": "EUR"}}
"""
from typing import Any, Dict, Optional

import requests
from rest_framework.exceptions import ValidationError

from nextintranet_warehouse.models.purchase import Purchase, PurchaseItemType

# POST /cart replaces an existing cart and demands a real CartKey. Inserting items
# without a CartKey is what makes Mouser create a new cart and return its key.
MOUSER_CART_URL = "https://api.mouser.com/api/v1/cart/items/insert"
EMPTY_CART_KEY = "00000000-0000-0000-0000-000000000000"


def get_order_api_config(supplier) -> Optional[Dict[str, Any]]:
    cfg = (supplier.api_config or {}).get("order_api")
    if isinstance(cfg, dict) and cfg.get("provider") == "mouser" and cfg.get("api_key"):
        return cfg
    return None


def supplier_has_mouser_cart(supplier) -> bool:
    return get_order_api_config(supplier) is not None


def create_mouser_cart(purchase: Purchase) -> Dict[str, Any]:
    cfg = get_order_api_config(purchase.supplier)
    if not cfg:
        raise ValidationError({"detail": "Supplier has no Mouser order API configured (api_config.order_api)."})

    cart_items = []
    for item in purchase.items.filter(item_type=PurchaseItemType.COMPONENT):
        symbol = (item.symbol or "").strip()
        if not symbol:
            raise ValidationError({"detail": f"Item {item.id} has no Mouser part number."})
        cart_items.append({"MouserPartNumber": symbol, "Quantity": int(item.quantity)})
    if not cart_items:
        raise ValidationError({"detail": "Purchase has no component items."})

    params = {"apiKey": cfg["api_key"]}
    if cfg.get("country_code"):
        params["countryCode"] = cfg["country_code"]
    currency = cfg.get("currency_code") or purchase.currency
    if currency:
        params["currencyCode"] = currency

    try:
        response = requests.post(
            MOUSER_CART_URL,
            params=params,
            json={"CartItems": cart_items},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
    except requests.HTTPError as exc:
        # Never echo the URL: it carries the API key.
        raise ValidationError({"detail": f"Mouser request failed: HTTP {exc.response.status_code}: {exc.response.text[:300]}"})
    except requests.RequestException as exc:
        raise ValidationError({"detail": f"Mouser request failed: {exc.__class__.__name__}"})
    except ValueError:
        raise ValidationError({"detail": "Mouser returned invalid JSON."})

    errors = [
        f'{e.get("PropertyName")}: {e.get("Message")}' if e.get("PropertyName") else (e.get("Message") or "Unknown error")
        for e in (data.get("Errors") or [])
    ]
    # Per-line problems (unknown part number, ...) come back on the cart items.
    for line in data.get("CartItems") or []:
        for e in line.get("Errors") or []:
            errors.append(f'{line.get("MouserPartNumber")}: {e.get("Message") or e.get("Code")}')
    if not data.get("CartKey") or data.get("CartKey") == EMPTY_CART_KEY:
        detail = "; ".join(errors) if errors else "no cart was created"
        raise ValidationError({"detail": f"Mouser did not create the cart: {detail}"})

    return {
        "cart_key": data.get("CartKey"),
        "currency_code": data.get("CurrencyCode"),
        "total_item_count": data.get("TotalItemCount"),
        "merchandise_total": data.get("MerchandiseTotal"),
        "errors": errors,
        "cart_url": "https://www.mouser.com/Cart/",
    }
