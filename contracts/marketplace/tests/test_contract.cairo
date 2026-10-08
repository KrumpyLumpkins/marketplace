use biblio_marketplace::{fee, payouts};
#[test]
fn exact_debit_and_maximum_integer() {
    assert_eq!(fee(100, 200), 2);
    let max: u256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    let (protocol, seller) = payouts(max, 500, 0);
    assert_eq!(protocol + seller, max);
    let (protocol, seller) = payouts(100, 200, 5);
    assert_eq!(protocol, 2);
    assert_eq!(seller, 93);
}
#[test]
#[should_panic(expected: ('FEE_CAP',))]
fn cannot_set_excessive_fee() {
    fee(100, 501);
}
#[test]
#[should_panic(expected: ('NO_PROCEEDS',))]
fn royalty_cannot_consume_price() {
    payouts(100, 0, 100);
}
use biblio_marketplace::{
    IMarketplaceDispatcher, IMarketplaceDispatcherTrait, IMarketplaceSafeDispatcher,
    IMarketplaceSafeDispatcherTrait, OrderKey,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
#[starknet::interface]
trait IMock<T> {
    fn mint(ref self: T, to: ContractAddress, id: u256);
    fn approve(ref self: T, spender: ContractAddress, amount: u256);
    fn set_approval(ref self: T, token_id: u256, spender: ContractAddress);
    fn set_royalty(ref self: T, recipient: ContractAddress, amount: u256);
    fn set_failure(ref self: T, fail: bool);
    fn fail_on_token(ref self: T, token_id: u256);
    fn set_reentry(ref self: T, market: ContractAddress, currency: ContractAddress);
    fn balance_of(self: @T, who: ContractAddress) -> u256;
    fn owner_of(self: @T, id: u256) -> ContractAddress;
}
fn addr(n: felt252) -> ContractAddress {
    n.try_into().unwrap()
}
fn deploy(name: ByteArray, data: Array<felt252>) -> ContractAddress {
    let (address, _) = declare(name).unwrap().contract_class().deploy(@data).unwrap();
    address
}
fn setup() -> (IMarketplaceDispatcher, IMockDispatcher, IMockDispatcher) {
    let m = IMarketplaceDispatcher { contract_address: deploy("Marketplace", array![10, 200, 40]) };
    let c = IMockDispatcher { contract_address: deploy("MockCurrency", array![]) };
    let n = IMockDispatcher { contract_address: deploy("MockNft", array![]) };
    start_cheat_caller_address(m.contract_address, addr(10));
    start_cheat_block_timestamp(m.contract_address, 100);
    m.set_collection(n.contract_address, true);
    m.set_currency(c.contract_address, true);
    c.mint(addr(30), 10000);
    n.mint(addr(20), 1);
    n.mint(addr(20), 2);
    n.set_royalty(addr(50), 5);
    start_cheat_caller_address(c.contract_address, addr(30));
    c.approve(m.contract_address, 10000);
    stop_cheat_caller_address(c.contract_address);
    start_cheat_caller_address(n.contract_address, addr(20));
    n.set_approval(1, m.contract_address);
    n.set_approval(2, m.contract_address);
    stop_cheat_caller_address(n.contract_address);
    (m, c, n)
}
#[test]
fn listing_settles_exactly_and_snapshots_royalty() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    n.set_royalty(addr(50), 99);
    start_cheat_caller_address(m.contract_address, addr(30));
    m.buy_listing(OrderKey { maker: addr(20), nonce }, c.contract_address, 100);
    assert_eq!(c.balance_of(addr(30)), 9900);
    assert_eq!(c.balance_of(addr(20)), 93);
    assert_eq!(c.balance_of(addr(40)), 2);
    assert_eq!(c.balance_of(addr(50)), 5);
    assert_eq!(n.owner_of(1), addr(30));
    assert_eq!(m.get_order(OrderKey { maker: addr(20), nonce }).state, 2);
}
#[test]
fn token_and_collection_offers_cannot_charge_more_than_maker_price() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(30));
    let a = m.create_offer(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let b = m.create_collection_offer(n.contract_address, c.contract_address, 100, 200, 10, 500);
    start_cheat_caller_address(m.contract_address, addr(20));
    m.accept_offer(OrderKey { maker: addr(30), nonce: a }, c.contract_address, 93);
    n.set_royalty(addr(50), 10);
    m.accept_collection_offer(OrderKey { maker: addr(30), nonce: b }, 2, c.contract_address, 88);
    assert_eq!(c.balance_of(addr(30)), 9800);
    assert_eq!(c.balance_of(addr(20)), 181);
    assert_eq!(n.owner_of(1), addr(30));
    assert_eq!(n.owner_of(2), addr(30));
}
#[test]
fn cancelled_orders_stay_cancelled_and_pause_does_not_trap_makers() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_paused(true);
    start_cheat_caller_address(m.contract_address, addr(20));
    m.cancel_order(nonce);
    m.cancel_order(nonce);
    assert_eq!(m.get_order(OrderKey { maker: addr(20), nonce }).state, 3);
}
#[test]
#[feature("safe_dispatcher")]
fn failed_payment_rolls_back_order_and_nft() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    c.set_failure(true);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    assert!(
        safe.buy_listing(OrderKey { maker: addr(20), nonce }, c.contract_address, 100).is_err(),
    );
    assert_eq!(m.get_order(OrderKey { maker: addr(20), nonce }).state, 1);
    assert_eq!(n.owner_of(1), addr(20));
    assert_eq!(c.balance_of(addr(30)), 10000);
}
#[test]
#[feature("safe_dispatcher")]
fn cart_is_atomic_and_rejects_duplicate_tokens() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let b = m.create_listing(n.contract_address, 2, c.contract_address, 100, 200, 5, 500);
    let keys = array![
        OrderKey { maker: addr(20), nonce: a }, OrderKey { maker: addr(20), nonce: b },
    ];
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    assert!(safe.buy_many(keys.span(), c.contract_address, 199, 150).is_err());
    assert_eq!(n.owner_of(1), addr(20));
    assert_eq!(c.balance_of(addr(30)), 10000);
    let duplicate = array![*keys.at(0), *keys.at(0)];
    assert!(safe.buy_many(duplicate.span(), c.contract_address, 200, 150).is_err());
    m.buy_many(keys.span(), c.contract_address, 200, 150);
    assert_eq!(n.owner_of(1), addr(30));
    assert_eq!(n.owner_of(2), addr(30));
    assert_eq!(c.balance_of(addr(30)), 9800);
}

#[test]
#[feature("safe_dispatcher")]
fn late_nft_failure_reverts_every_payment_transfer_and_order() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let b = m.create_listing(n.contract_address, 2, c.contract_address, 100, 200, 5, 500);
    let keys = array![
        OrderKey { maker: addr(20), nonce: a }, OrderKey { maker: addr(20), nonce: b },
    ];
    n.fail_on_token(2);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    assert!(safe.buy_many(keys.span(), c.contract_address, 200, 150).is_err());
    assert_eq!(c.balance_of(addr(30)), 10000);
    assert_eq!(c.balance_of(addr(20)), 0);
    assert_eq!(c.balance_of(addr(40)), 0);
    assert_eq!(c.balance_of(addr(50)), 0);
    assert_eq!(n.owner_of(1), addr(20));
    assert_eq!(n.owner_of(2), addr(20));
    assert_eq!(m.get_order(*keys.at(0)).state, 1);
    assert_eq!(m.get_order(*keys.at(1)).state, 1);
}

#[test]
fn maximum_cart_settles_twenty_five_nfts() {
    let (m, c, n) = setup();
    let mut keys = array![];
    start_cheat_caller_address(m.contract_address, addr(20));
    for id in 1_u64..26 {
        n.mint(addr(20), id.into());
        start_cheat_caller_address(n.contract_address, addr(20));
        n.set_approval(id.into(), m.contract_address);
        stop_cheat_caller_address(n.contract_address);
        let nonce = m
            .create_listing(n.contract_address, id.into(), c.contract_address, 100, 200, 5, 500);
        keys.append(OrderKey { maker: addr(20), nonce });
    }
    start_cheat_caller_address(m.contract_address, addr(30));
    m.buy_many(keys.span(), c.contract_address, 2500, 150);
    assert_eq!(c.balance_of(addr(30)), 7500);
    assert_eq!(c.balance_of(addr(20)), 2325);
    assert_eq!(c.balance_of(addr(40)), 50);
    assert_eq!(c.balance_of(addr(50)), 125);
    for id in 1_u64..26 {
        assert_eq!(n.owner_of(id.into()), addr(30));
    };
}

#[test]
#[feature("safe_dispatcher")]
fn expiry_authorization_and_admin_handoff_are_enforced() {
    let (m, c, n) = setup();
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    start_cheat_caller_address(m.contract_address, addr(30));
    assert!(
        safe.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500).is_err(),
    );
    assert!(safe.set_paused(true).is_err());
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(30));
    assert!(safe.cancel_order(nonce).is_err());
    start_cheat_block_timestamp(m.contract_address, 200);
    assert!(
        safe.buy_listing(OrderKey { maker: addr(20), nonce }, c.contract_address, 100).is_err(),
    );
    start_cheat_caller_address(m.contract_address, addr(10));
    m.propose_admin(addr(60));
    assert!(safe.accept_admin().is_err());
    start_cheat_caller_address(m.contract_address, addr(60));
    m.accept_admin();
    assert_eq!(m.get_config().admin, addr(60));
    start_cheat_caller_address(m.contract_address, addr(10));
    assert!(safe.set_paused(true).is_err());
}

#[test]
#[feature("safe_dispatcher")]
fn collection_offer_caps_and_seller_minimum_are_binding() {
    let (m, c, n) = setup();
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    start_cheat_caller_address(m.contract_address, addr(30));
    let nonce = m
        .create_collection_offer(n.contract_address, c.contract_address, 100, 200, 10, 500);
    let key = OrderKey { maker: addr(30), nonce };
    start_cheat_caller_address(m.contract_address, addr(20));
    n.set_royalty(addr(50), 11);
    assert!(safe.accept_collection_offer(key, 1, c.contract_address, 1).is_err());
    n.set_royalty(addr(50), 10);
    assert!(safe.accept_collection_offer(key, 1, c.contract_address, 89).is_err());
    assert_eq!(c.balance_of(addr(30)), 10000);
    assert_eq!(m.get_order(key).state, 1);
    m.accept_collection_offer(key, 1, c.contract_address, 88);
    assert!(safe.accept_collection_offer(key, 2, c.contract_address, 88).is_err());
    assert_eq!(c.balance_of(addr(30)), 9900);
}

#[test]
#[feature("safe_dispatcher")]
fn malicious_asset_callback_cannot_create_orders_during_settlement() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    n.set_reentry(m.contract_address, c.contract_address);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    let error = safe
        .buy_listing(OrderKey { maker: addr(20), nonce }, c.contract_address, 100)
        .unwrap_err();
    let mut guarded = false;
    for item in error {
        if item == 'REENTRANCY' {
            guarded = true;
        }
    }
    assert!(guarded);
    assert_eq!(c.balance_of(addr(30)), 10000);
    assert_eq!(n.owner_of(1), addr(20));
    assert_eq!(m.get_order(OrderKey { maker: addr(20), nonce }).state, 1);
}

#[test]
#[fuzzer(runs: 256)]
fn fuzz_allocations_conserve_buyer_price(price: u128, raw_bps: u16, raw_royalty: u128) {
    if price == 0 {
        return;
    }
    let p: u256 = price.into();
    let bps = raw_bps % 501;
    let remaining = p - fee(p, bps);
    let royalty = raw_royalty.into() % remaining;
    let (protocol, seller) = payouts(p, bps, royalty);
    assert!(seller > 0);
    assert_eq!(protocol + seller + royalty, p);
}

#[test]
#[feature("safe_dispatcher")]
fn fee_updates_are_admin_only_bounded_and_atomic() {
    let (m, _, _) = setup();
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    start_cheat_caller_address(m.contract_address, addr(20));
    assert!(safe.set_fee(300, addr(60)).is_err());
    start_cheat_caller_address(m.contract_address, addr(10));
    assert!(safe.set_fee(501, addr(60)).is_err());
    assert!(safe.set_fee(300, addr(0)).is_err());
    assert_eq!(m.get_config().fee_bps, 200);
    assert_eq!(m.get_config().fee_recipient, addr(40));
    m.set_paused(true);
    m.set_fee(0, addr(60));
    assert_eq!(m.get_config().fee_bps, 0);
    m.set_fee(500, addr(70));
    assert_eq!(m.get_config().fee_bps, 500);
    assert_eq!(m.get_config().fee_recipient, addr(70));
    m.propose_admin(addr(20));
    start_cheat_caller_address(m.contract_address, addr(20));
    m.accept_admin();
    m.set_fee(300, addr(60));
    start_cheat_caller_address(m.contract_address, addr(10));
    assert!(safe.set_fee(200, addr(40)).is_err());
}

#[test]
fn existing_orders_keep_fee_rates_and_fills_use_current_recipient() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let old = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_fee(500, addr(60));
    start_cheat_caller_address(m.contract_address, addr(20));
    let new = m.create_listing(n.contract_address, 2, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(30));
    m
        .buy_many(
            array![
                OrderKey { maker: addr(20), nonce: old }, OrderKey { maker: addr(20), nonce: new },
            ]
                .span(),
            c.contract_address,
            200,
            200,
        );
    assert_eq!(c.balance_of(addr(20)), 183);
    assert_eq!(c.balance_of(addr(60)), 7);
    assert_eq!(c.balance_of(addr(40)), 0);
    assert_eq!(c.balance_of(addr(30)), 9800);
}

#[test]
#[feature("safe_dispatcher")]
fn fee_increase_cannot_silently_change_creation_consent() {
    let (m, c, n) = setup();
    m.set_fee(300, addr(60));
    start_cheat_caller_address(m.contract_address, addr(20));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    assert!(
        safe.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 200).is_err(),
    );
    assert!(
        safe.create_offer(n.contract_address, 1, c.contract_address, 100, 200, 5, 200).is_err(),
    );
    assert!(
        safe
            .create_collection_offer(n.contract_address, c.contract_address, 100, 200, 5, 200)
            .is_err(),
    );
    assert!(
        safe.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 501).is_err(),
    );
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_fee(100, addr(60));
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 200);
    assert_eq!(nonce, 1);
    assert_eq!(m.get_order(OrderKey { maker: addr(20), nonce }).terms.fee_bps, 100);
}

#[test]
fn existing_token_and_collection_offers_keep_fee_snapshots() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(30));
    let a = m.create_offer(n.contract_address, 1, c.contract_address, 100, 200, 5, 200);
    let b = m.create_collection_offer(n.contract_address, c.contract_address, 100, 200, 5, 200);
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_fee(500, addr(60));
    start_cheat_caller_address(m.contract_address, addr(20));
    m.accept_offer(OrderKey { maker: addr(30), nonce: a }, c.contract_address, 93);
    m.accept_collection_offer(OrderKey { maker: addr(30), nonce: b }, 2, c.contract_address, 93);
    assert_eq!(c.balance_of(addr(20)), 186);
    assert_eq!(c.balance_of(addr(60)), 4);
    assert_eq!(c.balance_of(addr(30)), 9800);
}
