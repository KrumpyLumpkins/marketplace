use biblio_marketplace::{
    IMarketplaceDispatcher, IMarketplaceDispatcherTrait, IMarketplaceSafeDispatcher,
    IMarketplaceSafeDispatcherTrait, OrderKey, fee, payouts, zero,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

#[starknet::interface]
trait IAsset<T> {
    fn mint(ref self: T, to: ContractAddress, id: u256);
    fn approve(ref self: T, spender: ContractAddress, amount: u256);
    fn set_approval(ref self: T, id: u256, spender: ContractAddress);
    fn set_royalty(ref self: T, recipient: ContractAddress, amount: u256);
    fn set_receiver_checks(ref self: T, enabled: bool);
    fn set_payment_reentry(ref self: T, market: ContractAddress, nonce: u64);
    fn set_false_after_recipient(ref self: T, recipient: ContractAddress);
    fn owner_of(self: @T, id: u256) -> ContractAddress;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
}
#[starknet::interface]
trait IProbe<T> {
    fn configure(
        ref self: T, target: ContractAddress, selector: felt252, data: Span<felt252>, reject: bool,
    );
    fn run(ref self: T, target: ContractAddress, selector: felt252, data: Span<felt252>);
}
fn addr(n: felt252) -> ContractAddress {
    n.try_into().unwrap()
}
fn deploy(name: ByteArray, data: Array<felt252>) -> ContractAddress {
    let (address, _) = declare(name).unwrap().contract_class().deploy(@data).unwrap();
    address
}
fn setup() -> (IMarketplaceDispatcher, IAssetDispatcher, IAssetDispatcher) {
    let m = IMarketplaceDispatcher { contract_address: deploy("Marketplace", array![10, 200, 40]) };
    let c = IAssetDispatcher { contract_address: deploy("MockCurrency", array![]) };
    let n = IAssetDispatcher { contract_address: deploy("MockNft", array![]) };
    start_cheat_block_timestamp(m.contract_address, 100);
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_collection(n.contract_address, true);
    m.set_currency(c.contract_address, true);
    c.mint(addr(30), 10000);
    start_cheat_caller_address(c.contract_address, addr(30));
    c.approve(m.contract_address, 10000);
    stop_cheat_caller_address(c.contract_address);
    for id in 1_u64..4 {
        n.mint(addr(20), id.into());
        start_cheat_caller_address(n.contract_address, addr(20));
        n.set_approval(id.into(), m.contract_address);
        stop_cheat_caller_address(n.contract_address);
    }
    n.set_royalty(addr(50), 5);
    (m, c, n)
}
fn key(nonce: u64) -> OrderKey {
    OrderKey { maker: addr(20), nonce }
}
fn has_error(error: Array<felt252>, expected: felt252) {
    let mut matched = false;
    for value in error {
        if value == expected {
            matched = true;
        }
    }
    assert!(matched);
}

// No caller cheat is active on the market when the probe buys: callback identity is real.
#[test]
#[feature("safe_dispatcher")]
fn receiver_cannot_reenter_any_of_the_fifteen_mutating_entrypoints() {
    let (m, c, n) = setup();
    let probe = IProbeDispatcher { contract_address: deploy("ReceiverProbe", array![]) };
    let safe_probe = IProbeSafeDispatcher { contract_address: probe.contract_address };
    c.mint(probe.contract_address, 1000);
    probe
        .run(
            c.contract_address,
            selector!("approve"),
            array![m.contract_address.into(), 1000, 0].span(),
        );
    n.set_receiver_checks(true);
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    stop_cheat_caller_address(m.contract_address);
    let buy = array![20, nonce.into(), c.contract_address.into(), 100, 0];
    let attacks = array![
        (
            selector!("create_listing"),
            array![
                n.contract_address.into(), 1, 0, c.contract_address.into(), 100, 0, 200, 5, 0, 500,
            ],
        ),
        (
            selector!("create_offer"),
            array![
                n.contract_address.into(), 1, 0, c.contract_address.into(), 100, 0, 200, 5, 0, 500,
            ],
        ),
        (
            selector!("create_collection_offer"),
            array![n.contract_address.into(), c.contract_address.into(), 100, 0, 200, 5, 0, 500],
        ),
        (selector!("cancel_order"), array![nonce.into()]),
        (selector!("cancel_orders"), array![1, nonce.into()]),
        (selector!("buy_listing"), array![20, nonce.into(), c.contract_address.into(), 100, 0]),
        (
            selector!("buy_many"),
            array![1, 20, nonce.into(), c.contract_address.into(), 100, 0, 150],
        ),
        (selector!("accept_offer"), array![20, nonce.into(), c.contract_address.into(), 1, 0]),
        (
            selector!("accept_collection_offer"),
            array![20, nonce.into(), 1, 0, c.contract_address.into(), 1, 0],
        ),
        (selector!("set_collection"), array![n.contract_address.into(), 0]),
        (selector!("set_currency"), array![c.contract_address.into(), 0]),
        (selector!("set_fee"), array![300, 60]), (selector!("set_paused"), array![1]),
        (selector!("propose_admin"), array![99]), (selector!("accept_admin"), array![]),
    ];
    for (selector, payload) in attacks {
        probe.configure(m.contract_address, selector, payload.span(), false);
        has_error(
            safe_probe.run(m.contract_address, selector!("buy_listing"), buy.span()).unwrap_err(),
            'REENTRANCY',
        );
        assert_eq!(m.get_order(key(nonce)).state, 1);
        assert_eq!(n.owner_of(1), addr(20));
        assert_eq!(c.balance_of(probe.contract_address), 1000);
        assert_eq!(c.allowance(probe.contract_address, m.contract_address), 1000);
        assert_eq!(c.balance_of(addr(20)), 0);
        assert_eq!(c.balance_of(addr(40)), 0);
        assert_eq!(c.balance_of(addr(50)), 0);
    }
    probe.configure(m.contract_address, 0, array![].span(), false);
    probe.run(m.contract_address, selector!("buy_listing"), buy.span());
    assert_eq!(n.owner_of(1), probe.contract_address);
    assert_eq!(c.balance_of(probe.contract_address), 900);
    assert_eq!(m.get_order(key(nonce)).state, 2);
}

#[test]
#[feature("safe_dispatcher")]
fn receiver_rejection_reverts_payments_approvals_and_filled_state() {
    let (m, c, n) = setup();
    let probe = IProbeDispatcher { contract_address: deploy("ReceiverProbe", array![]) };
    c.mint(probe.contract_address, 100);
    probe
        .run(
            c.contract_address,
            selector!("approve"),
            array![m.contract_address.into(), 100, 0].span(),
        );
    probe.configure(m.contract_address, 0, array![].span(), true);
    n.set_receiver_checks(true);
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    stop_cheat_caller_address(m.contract_address);
    let safe = IProbeSafeDispatcher { contract_address: probe.contract_address };
    has_error(
        safe
            .run(
                m.contract_address,
                selector!("buy_listing"),
                array![20, nonce.into(), c.contract_address.into(), 100, 0].span(),
            )
            .unwrap_err(),
        'BAD_RECEIVER',
    );
    assert_eq!(m.get_order(key(nonce)).state, 1);
    assert_eq!(c.balance_of(probe.contract_address), 100);
    assert_eq!(c.allowance(probe.contract_address, m.contract_address), 100);
    assert_eq!(c.balance_of(addr(20)), 0);
    assert_eq!(n.owner_of(1), addr(20));
}

#[test]
#[feature("safe_dispatcher")]
fn payment_callback_cannot_cancel_and_failed_call_releases_guard() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    c.set_payment_reentry(m.contract_address, nonce);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    has_error(safe.buy_listing(key(nonce), c.contract_address, 100).unwrap_err(), 'REENTRANCY');
    assert_eq!(c.balance_of(addr(30)), 10000);
    assert_eq!(c.allowance(addr(30), m.contract_address), 10000);
    assert_eq!(m.get_order(key(nonce)).state, 1);
    c.set_payment_reentry(zero(), 0);
    m.buy_listing(key(nonce), c.contract_address, 100);
    assert_eq!(m.get_order(key(nonce)).state, 2);
}

#[test]
#[feature("safe_dispatcher")]
fn max_u256_cart_sum_cannot_wrap_into_an_affordable_cart() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let max: u256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    let a = m.create_listing(n.contract_address, 1, c.contract_address, max, 200, 5, 500);
    let b = m.create_listing(n.contract_address, 2, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    assert!(safe.buy_many(array![key(a), key(b)].span(), c.contract_address, max, 150).is_err());
    assert_eq!(m.get_order(key(a)).state, 1);
    assert_eq!(m.get_order(key(b)).state, 1);
    assert_eq!(c.balance_of(addr(30)), 10000);
    assert_eq!(n.owner_of(1), addr(20));
    m.buy_listing(key(b), c.contract_address, 100);
}

#[test]
#[feature("safe_dispatcher")]
fn cancellation_batch_rolls_back_when_later_nonce_is_unknown() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    has_error(safe.cancel_orders(array![a, 999].span()).unwrap_err(), 'NOT_OPEN');
    assert_eq!(m.get_order(key(a)).state, 1);
    m.cancel_orders(array![a, a].span());
    assert_eq!(m.get_order(key(a)).state, 3);
}

#[test]
#[feature("safe_dispatcher")]
fn disabling_both_assets_does_not_prevent_expired_order_cancellation() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_currency(c.contract_address, false);
    m.set_collection(n.contract_address, false);
    m.set_paused(true);
    start_cheat_block_timestamp(m.contract_address, 200);
    start_cheat_caller_address(m.contract_address, addr(20));
    m.cancel_orders(array![a].span());
    assert_eq!(m.get_order(key(a)).state, 3);
}

#[test]
#[feature("safe_dispatcher")]
fn deadline_currency_kind_and_self_trade_checks_cannot_be_bypassed() {
    let (m, c, n) = setup();
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    has_error(safe.buy_listing(key(a), c.contract_address, 100).unwrap_err(), 'SELF_TRADE');
    start_cheat_caller_address(m.contract_address, addr(30));
    has_error(
        safe.buy_many(array![key(a)].span(), c.contract_address, 100, 100).unwrap_err(), 'DEADLINE',
    );
    has_error(safe.accept_offer(key(a), c.contract_address, 0).unwrap_err(), 'WRONG_KIND');
    let other = IAssetDispatcher { contract_address: deploy("MockCurrency", array![]) };
    start_cheat_caller_address(m.contract_address, addr(10));
    m.set_currency(other.contract_address, true);
    start_cheat_caller_address(m.contract_address, addr(30));
    has_error(
        safe.buy_listing(key(a), other.contract_address, 100).unwrap_err(), 'CURRENCY_MISMATCH',
    );
    m.buy_many(array![key(a)].span(), c.contract_address, 100, 101);
    assert_eq!(n.owner_of(1), addr(30));
}

#[test]
fn payout_aliases_match_net_balances_without_charging_the_buyer_twice() {
    for recipient in array![addr(30), addr(20), addr(40)] {
        let (m, c, n) = setup();
        n.set_royalty(recipient, 5);
        start_cheat_caller_address(m.contract_address, addr(20));
        let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
        start_cheat_caller_address(m.contract_address, addr(30));
        m.buy_listing(key(a), c.contract_address, 100);
        assert_eq!(c.balance_of(addr(30)), if recipient == addr(30) {
            9905
        } else {
            9900
        });
        assert_eq!(c.balance_of(addr(20)), if recipient == addr(20) {
            98
        } else {
            93
        });
        assert_eq!(c.balance_of(addr(40)), if recipient == addr(40) {
            7
        } else {
            2
        });
    }
}

#[test]
#[feature("safe_dispatcher")]
fn older_pending_admin_cannot_accept_after_nominee_replacement() {
    let (m, _, _) = setup();
    m.propose_admin(addr(60));
    m.propose_admin(addr(70));
    start_cheat_caller_address(m.contract_address, addr(60));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    has_error(safe.accept_admin().unwrap_err(), 'NOT_PENDING_ADMIN');
    start_cheat_caller_address(m.contract_address, addr(70));
    m.accept_admin();
    has_error(safe.accept_admin().unwrap_err(), 'NOT_PENDING_ADMIN');
    assert_eq!(m.get_config().admin, addr(70));
}

#[test]
#[fuzzer(runs: 256)]
fn full_width_allocations_never_overflow_or_lose_value(
    price: u256, raw_bps: u16, raw_royalty: u256,
) {
    if price == 0 {
        return;
    }
    let bps = raw_bps % 501;
    let royalty = raw_royalty % (price - fee(price, bps));
    let (protocol, seller) = payouts(price, bps, royalty);
    assert!(seller > 0);
    assert_eq!(protocol + seller + royalty, price);
}

#[test]
#[feature("safe_dispatcher")]
fn false_return_after_fee_or_royalty_transfer_reverts_earlier_payouts() {
    for recipient in array![addr(40), addr(50)] {
        let (m, c, n) = setup();
        start_cheat_caller_address(m.contract_address, addr(20));
        let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
        c.set_false_after_recipient(recipient);
        start_cheat_caller_address(m.contract_address, addr(30));
        let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
        has_error(safe.buy_listing(key(a), c.contract_address, 100).unwrap_err(), 'PAYMENT_FAILED');
        assert_eq!(c.balance_of(addr(30)), 10000);
        assert_eq!(c.balance_of(addr(20)), 0);
        assert_eq!(c.balance_of(addr(40)), 0);
        assert_eq!(c.balance_of(addr(50)), 0);
        assert_eq!(c.allowance(addr(30), m.contract_address), 10000);
        assert_eq!(n.owner_of(1), addr(20));
        assert_eq!(m.get_order(key(a)).state, 1);
    }
}

#[test]
#[feature("safe_dispatcher")]
fn distinct_orders_for_the_same_nft_cannot_double_fill_a_cart() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let b = m.create_listing(n.contract_address, 1, c.contract_address, 200, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(30));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    has_error(
        safe.buy_many(array![key(a), key(b)].span(), c.contract_address, 300, 150).unwrap_err(),
        'DUPLICATE_NFT',
    );
    m.buy_listing(key(a), c.contract_address, 100);
    has_error(safe.buy_listing(key(b), c.contract_address, 200).unwrap_err(), 'NOT_OWNER');
    assert_eq!(c.balance_of(addr(30)), 9900);
    assert_eq!(m.get_order(key(b)).state, 1);
}

#[test]
#[feature("safe_dispatcher")]
fn batch_bounds_fail_before_any_fill_or_cancellation() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let a = m.create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    let mut nonces = array![];
    let mut keys = array![];
    for _i in 0_u32..26 {
        nonces.append(a);
        keys.append(key(a));
    }
    has_error(safe.cancel_orders(array![].span()).unwrap_err(), 'BATCH_SIZE');
    has_error(safe.cancel_orders(nonces.span()).unwrap_err(), 'BATCH_SIZE');
    start_cheat_caller_address(m.contract_address, addr(30));
    has_error(
        safe.buy_many(array![].span(), c.contract_address, 10000, 150).unwrap_err(), 'BATCH_SIZE',
    );
    has_error(
        safe.buy_many(keys.span(), c.contract_address, 10000, 150).unwrap_err(), 'BATCH_SIZE',
    );
    assert_eq!(m.get_order(key(a)).state, 1);
    assert_eq!(c.balance_of(addr(30)), 10000);
}

#[test]
#[feature("safe_dispatcher")]
fn malformed_royalty_and_zero_price_cannot_allocate_orders_or_consume_nonces() {
    let (m, c, n) = setup();
    start_cheat_caller_address(m.contract_address, addr(20));
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    n.set_royalty(zero(), 5);
    has_error(
        safe
            .create_listing(n.contract_address, 1, c.contract_address, 100, 200, 5, 500)
            .unwrap_err(),
        'ROYALTY_RECEIVER',
    );
    n.set_royalty(addr(50), 98);
    has_error(
        safe
            .create_listing(n.contract_address, 1, c.contract_address, 100, 200, 98, 500)
            .unwrap_err(),
        'NO_PROCEEDS',
    );
    n.set_royalty(zero(), 0);
    has_error(
        safe.create_listing(n.contract_address, 1, c.contract_address, 0, 200, 0, 500).unwrap_err(),
        'NO_PROCEEDS',
    );
    let nonce = m.create_listing(n.contract_address, 1, c.contract_address, 1, 200, 0, 500);
    assert_eq!(nonce, 1);
    start_cheat_caller_address(m.contract_address, addr(30));
    m.buy_listing(key(nonce), c.contract_address, 1);
    assert_eq!(c.balance_of(addr(20)), 1);
}

#[test]
fn zero_and_full_width_token_ids_do_not_alias() {
    let (m, c, n) = setup();
    let max: u256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    let mut keys = array![];
    for id in array![0, max] {
        n.mint(addr(20), id);
        start_cheat_caller_address(n.contract_address, addr(20));
        n.set_approval(id, m.contract_address);
        stop_cheat_caller_address(n.contract_address);
        start_cheat_caller_address(m.contract_address, addr(20));
        keys
            .append(
                key(m.create_listing(n.contract_address, id, c.contract_address, 100, 200, 5, 500)),
            );
    }
    start_cheat_caller_address(m.contract_address, addr(30));
    m.buy_many(keys.span(), c.contract_address, 200, 150);
    assert_eq!(n.owner_of(0), addr(30));
    assert_eq!(n.owner_of(max), addr(30));
    assert_eq!(n.owner_of(1), addr(20));
}

#[test]
#[feature("safe_dispatcher")]
fn overlapping_offers_cannot_spend_more_than_remaining_funds() {
    let (m, c, n) = setup();
    c.mint(addr(70), 100);
    start_cheat_caller_address(c.contract_address, addr(70));
    c.approve(m.contract_address, 10000);
    stop_cheat_caller_address(c.contract_address);
    start_cheat_caller_address(m.contract_address, addr(70));
    let a = m.create_offer(n.contract_address, 1, c.contract_address, 100, 200, 5, 500);
    let b = m.create_offer(n.contract_address, 2, c.contract_address, 100, 200, 5, 500);
    start_cheat_caller_address(m.contract_address, addr(20));
    m.accept_offer(OrderKey { maker: addr(70), nonce: a }, c.contract_address, 93);
    let safe = IMarketplaceSafeDispatcher { contract_address: m.contract_address };
    has_error(
        safe
            .accept_offer(OrderKey { maker: addr(70), nonce: b }, c.contract_address, 93)
            .unwrap_err(),
        'BALANCE',
    );
    assert_eq!(c.balance_of(addr(70)), 0);
    assert_eq!(c.balance_of(addr(20)), 93);
    assert_eq!(m.get_order(OrderKey { maker: addr(70), nonce: b }).state, 1);
    assert_eq!(n.owner_of(2), addr(20));
}
