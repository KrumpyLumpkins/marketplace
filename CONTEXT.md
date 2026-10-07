# Marketplace

A marketplace where people list and buy NFTs, make token-specific offers, and settle trades in a chosen payment currency.

## Language

**Order**:
A maker's commitment to trade a specified NFT under fixed economic terms until the order is filled, cancelled or expires.
_Avoid_: Transaction, cart item

**Listing**:
A sell order created by the NFT's owner.
_Avoid_: Offer when referring to a sell order

**Offer**:
A buy order created by a prospective buyer for a particular NFT or an eligible NFT from a specified collection.
_Avoid_: Listing when referring to a buy order

**Token offer**:
A buy order for one identified NFT.

**Collection offer**:
A buy order for any eligible NFT from one specified collection. A one-shot collection offer is consumed by the first successful fill.

**Maker**:
The person who creates an order; the seller for a listing and the buyer for an offer.

**Taker**:
The person who fills an order; the buyer of a listing and the seller accepting an offer.

**Fill**:
The settlement of an order through exchange of the NFT and the agreed payment.
_Avoid_: Transaction submission, add to cart

**Buyer debit**:
The gross payment currency allocated by the buyer to a trade, including marketplace fees and royalties but excluding network fees. The buyer's net balance decrease can be lower if they also receive a payout.
_Avoid_: Price when its fee treatment is unspecified

**Seller proceeds**:
The seller's allocated payment after marketplace fees and royalties. A seller who is also a royalty recipient may receive that separate allocation as well.
_Avoid_: Price when its fee treatment is unspecified

**Royalty**:
The part of a trade's payment allocated to the collection's designated royalty recipient.

**Cart**:
A buyer's selection of listings in one payment currency, intended to settle together.

**Cancellation**:
The maker's permanent withdrawal of an unfilled order.
_Avoid_: Expiry, temporary invalidity

**Availability**:
Whether an open order can currently be filled given expiry, asset ownership, approvals, funds and trading restrictions.
_Avoid_: Order status when describing transient conditions

**Legacy order**:
An order on the previous Arcade marketplace, distinct from orders on the replacement marketplace.

**Index reflection**:
The point at which the marketplace's read data shows a trade already accepted by the chain.
_Avoid_: Settlement, confirmation
