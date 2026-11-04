# Mouser cart integration

Purchase -> Mouser cart, see `nextintranet_warehouse/services/mouser.py`.

- API key for cart/order lives in `Supplier.api_config["order_api"]` (separate from the search key).
- The linked cart is stored in `Purchase.metadata["mouser_cart"]` (`cart_key`, `currency_code`, `synced_at`).
- `POST /api/v1/store/purchase/<id>/mouser-cart/` creates (`cart/items/insert`, no CartKey) or overwrites
  (`POST cart` with CartKey) the cart. `GET` reads it and diffs against the purchase. `DELETE` unlinks.
- `POST cart` without an existing CartKey fails with `Required` / `PropertyName: CartKey`.

## TODO

- Import an existing Mouser cart into a new purchase (reverse direction): read it via `GET cart?cartKey=`,
  match `MouserPartNumber` to `SupplierRelation.symbol`, create the purchase items and store the cart key.
- Apply "Check cart changes" differences back to the purchase (currently only reported).
