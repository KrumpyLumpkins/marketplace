use starknet::ContractAddress;

pub const ERC721_ID: felt252 = 0x33eb2f84c309543403fd69f0d0f363781ef06ef6faeb0131ff16ea3175bd943;
pub const ERC2981_ID: felt252 = 0x2d3414e45a8700c29f119a54b9f11dca0e29e06ddcb214018fc37340e165ed6;
pub fn fee(price: u256, bps: u16) -> u256 {
    assert(bps <= 500, 'FEE_CAP');
    let rate: u256 = bps.into();
    (price / 10000) * rate + ((price % 10000) * rate) / 10000
}
pub fn payouts(price: u256, bps: u16, royalty: u256) -> (u256, u256) {
    let protocol = fee(price, bps);
    assert(price > protocol && royalty < price - protocol, 'NO_PROCEEDS');
    (protocol, price - protocol - royalty)
}
pub fn zero() -> ContractAddress {
    0.try_into().unwrap()
}

#[derive(Copy, Drop, Serde)]
pub struct OrderKey {
    pub maker: ContractAddress,
    pub nonce: u64,
}
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Terms {
    pub kind: u8,
    pub collection: ContractAddress,
    pub token_id: u256,
    pub currency: ContractAddress,
    pub buyer_debit: u256,
    pub expiry: u64,
    pub royalty_cap: u256,
    pub royalty_recipient: ContractAddress,
    pub royalty_amount: u256,
}
#[derive(Copy, Drop, Serde)]
pub struct Order {
    pub terms: Terms,
    pub state: u8,
}
#[derive(Copy, Drop, Serde)]
pub struct Config {
    pub version: u32,
    pub admin: ContractAddress,
    pub paused: bool,
    pub fee_bps: u16,
    pub fee_recipient: ContractAddress,
}
#[starknet::interface]
pub trait IToken<T> {
    fn supports_interface(self: @T, interface_id: felt252) -> bool;
    fn owner_of(self: @T, token_id: u256) -> ContractAddress;
    fn get_approved(self: @T, token_id: u256) -> ContractAddress;
    fn is_approved_for_all(self: @T, owner: ContractAddress, operator: ContractAddress) -> bool;
    fn safe_transfer_from(
        ref self: T,
        from: ContractAddress,
        to: ContractAddress,
        token_id: u256,
        data: Span<felt252>,
    );
    fn royalty_info(self: @T, token_id: u256, sale_price: u256) -> (ContractAddress, u256);
}
#[starknet::interface]
pub trait ICurrency<T> {
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
}
#[starknet::interface]
pub trait IMarketplace<T> {
    fn create_listing(
        ref self: T,
        collection: ContractAddress,
        token_id: u256,
        currency: ContractAddress,
        buyer_debit: u256,
        expiry: u64,
        max_royalty: u256,
    ) -> u64;
    fn create_offer(
        ref self: T,
        collection: ContractAddress,
        token_id: u256,
        currency: ContractAddress,
        buyer_debit: u256,
        expiry: u64,
        max_royalty: u256,
    ) -> u64;
    fn create_collection_offer(
        ref self: T,
        collection: ContractAddress,
        currency: ContractAddress,
        buyer_debit: u256,
        expiry: u64,
        max_royalty: u256,
    ) -> u64;
    fn cancel_order(ref self: T, nonce: u64);
    fn cancel_orders(ref self: T, nonces: Span<u64>);
    fn buy_listing(ref self: T, key: OrderKey, currency: ContractAddress, max_total: u256);
    fn buy_many(
        ref self: T,
        keys: Span<OrderKey>,
        currency: ContractAddress,
        max_total: u256,
        deadline: u64,
    );
    fn accept_offer(ref self: T, key: OrderKey, currency: ContractAddress, min_proceeds: u256);
    fn accept_collection_offer(
        ref self: T, key: OrderKey, token_id: u256, currency: ContractAddress, min_proceeds: u256,
    );
    fn get_order(self: @T, key: OrderKey) -> Order;
    fn get_config(self: @T) -> Config;
    fn quote_terms(
        self: @T, collection: ContractAddress, token_id: u256, buyer_debit: u256,
    ) -> (u256, ContractAddress, u256, u256);
    fn set_collection(ref self: T, collection: ContractAddress, enabled: bool);
    fn set_currency(ref self: T, currency: ContractAddress, enabled: bool);
    fn set_paused(ref self: T, paused: bool);
    fn propose_admin(ref self: T, admin: ContractAddress);
    fn accept_admin(ref self: T);
}

#[starknet::contract]
pub mod Marketplace {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use super::{
        Config, ERC2981_ID, ERC721_ID, ICurrencyDispatcher, ICurrencyDispatcherTrait,
        ITokenDispatcher, ITokenDispatcherTrait, Order, OrderKey, Terms, payouts, zero,
    };
    #[storage]
    struct Storage {
        admin: ContractAddress,
        pending_admin: ContractAddress,
        paused: bool,
        entered: bool,
        fee_bps: u16,
        fee_recipient: ContractAddress,
        collections: Map<ContractAddress, bool>,
        royalty_support: Map<ContractAddress, bool>,
        currencies: Map<ContractAddress, bool>,
        nonces: Map<ContractAddress, u64>,
        terms: Map<(ContractAddress, u64), Terms>,
        states: Map<(ContractAddress, u64), u8>,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        MarketplaceInitialized: MarketplaceInitialized,
        OrderCreated: OrderCreated,
        OrderCancelled: OrderCancelled,
        OrderFilled: OrderFilled,
        TradingChanged: TradingChanged,
        CollectionPolicyChanged: CollectionPolicyChanged,
        CurrencyPolicyChanged: CurrencyPolicyChanged,
        AdminProposed: AdminProposed,
        AdminTransferred: AdminTransferred,
    }
    #[derive(Drop, starknet::Event)]
    pub struct MarketplaceInitialized {
        pub version: u32,
        pub admin: ContractAddress,
        pub fee_bps: u16,
        pub fee_recipient: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OrderCreated {
        #[key]
        pub maker: ContractAddress,
        #[key]
        pub nonce: u64,
        pub terms: Terms,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OrderCancelled {
        #[key]
        pub maker: ContractAddress,
        #[key]
        pub nonce: u64,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OrderFilled {
        #[key]
        pub maker: ContractAddress,
        #[key]
        pub nonce: u64,
        pub buyer: ContractAddress,
        pub seller: ContractAddress,
        pub collection: ContractAddress,
        pub token_id: u256,
        pub currency: ContractAddress,
        pub buyer_debit: u256,
        pub seller_proceeds: u256,
        pub protocol_fee: u256,
        pub fee_recipient: ContractAddress,
        pub royalty_amount: u256,
        pub royalty_recipient: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct TradingChanged {
        pub paused: bool,
    }
    #[derive(Drop, starknet::Event)]
    pub struct CollectionPolicyChanged {
        #[key]
        pub collection: ContractAddress,
        pub enabled: bool,
        pub royalties: bool,
    }
    #[derive(Drop, starknet::Event)]
    pub struct CurrencyPolicyChanged {
        #[key]
        pub currency: ContractAddress,
        pub enabled: bool,
    }
    #[derive(Drop, starknet::Event)]
    pub struct AdminProposed {
        pub admin: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct AdminTransferred {
        pub previous: ContractAddress,
        pub admin: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        fee_bps: u16,
        fee_recipient: ContractAddress,
    ) {
        assert(admin != zero() && fee_recipient != zero(), 'ZERO_ADDRESS');
        assert(fee_bps <= 500, 'FEE_CAP');
        self.admin.write(admin);
        self.fee_bps.write(fee_bps);
        self.fee_recipient.write(fee_recipient);
        self.emit(MarketplaceInitialized { version: 1, admin, fee_bps, fee_recipient });
    }
    #[abi(embed_v0)]
    impl MarketplaceImpl of super::IMarketplace<ContractState> {
        fn create_listing(
            ref self: ContractState,
            collection: ContractAddress,
            token_id: u256,
            currency: ContractAddress,
            buyer_debit: u256,
            expiry: u64,
            max_royalty: u256,
        ) -> u64 {
            self.lock();
            let nonce = self
                .create(1, collection, token_id, currency, buyer_debit, expiry, max_royalty);
            self.unlock();
            nonce
        }
        fn create_offer(
            ref self: ContractState,
            collection: ContractAddress,
            token_id: u256,
            currency: ContractAddress,
            buyer_debit: u256,
            expiry: u64,
            max_royalty: u256,
        ) -> u64 {
            self.lock();
            let nonce = self
                .create(2, collection, token_id, currency, buyer_debit, expiry, max_royalty);
            self.unlock();
            nonce
        }
        fn create_collection_offer(
            ref self: ContractState,
            collection: ContractAddress,
            currency: ContractAddress,
            buyer_debit: u256,
            expiry: u64,
            max_royalty: u256,
        ) -> u64 {
            self.lock();
            let nonce = self.create(3, collection, 0, currency, buyer_debit, expiry, max_royalty);
            self.unlock();
            nonce
        }
        fn cancel_order(ref self: ContractState, nonce: u64) {
            self.lock();
            self.cancel(nonce);
            self.unlock();
        }
        fn cancel_orders(ref self: ContractState, nonces: Span<u64>) {
            self.lock();
            assert(nonces.len() > 0 && nonces.len() <= 25, 'BATCH_SIZE');
            for nonce in nonces {
                self.cancel(*nonce);
            }
            self.unlock();
        }
        fn buy_listing(
            ref self: ContractState, key: OrderKey, currency: ContractAddress, max_total: u256,
        ) {
            self.lock();
            self.buy(array![key].span(), currency, max_total, get_block_timestamp() + 1);
            self.unlock();
        }
        fn buy_many(
            ref self: ContractState,
            keys: Span<OrderKey>,
            currency: ContractAddress,
            max_total: u256,
            deadline: u64,
        ) {
            self.lock();
            self.buy(keys, currency, max_total, deadline);
            self.unlock();
        }
        fn accept_offer(
            ref self: ContractState, key: OrderKey, currency: ContractAddress, min_proceeds: u256,
        ) {
            self.lock();
            let terms = self.checked(key, currency, 2);
            self.accept(key, terms, terms.token_id, min_proceeds);
            self.unlock();
        }
        fn accept_collection_offer(
            ref self: ContractState,
            key: OrderKey,
            token_id: u256,
            currency: ContractAddress,
            min_proceeds: u256,
        ) {
            self.lock();
            let terms = self.checked(key, currency, 3);
            self.accept(key, terms, token_id, min_proceeds);
            self.unlock();
        }
        fn get_order(self: @ContractState, key: OrderKey) -> Order {
            Order {
                terms: self.terms.read((key.maker, key.nonce)),
                state: self.states.read((key.maker, key.nonce)),
            }
        }
        fn get_config(self: @ContractState) -> Config {
            Config {
                version: 1,
                admin: self.admin.read(),
                paused: self.paused.read(),
                fee_bps: self.fee_bps.read(),
                fee_recipient: self.fee_recipient.read(),
            }
        }
        fn quote_terms(
            self: @ContractState, collection: ContractAddress, token_id: u256, buyer_debit: u256,
        ) -> (u256, ContractAddress, u256, u256) {
            assert(self.collections.read(collection), 'COLLECTION_DISABLED');
            let (receiver, amount) = self.royalty(collection, token_id, buyer_debit);
            let (protocol, seller) = payouts(buyer_debit, self.fee_bps.read(), amount);
            (protocol, receiver, amount, seller)
        }
        fn set_collection(ref self: ContractState, collection: ContractAddress, enabled: bool) {
            self.lock();
            self.only_admin();
            assert(collection != zero(), 'ZERO_ADDRESS');
            let token = ITokenDispatcher { contract_address: collection };
            let royalties = if enabled {
                assert(token.supports_interface(ERC721_ID), 'NOT_ERC721');
                token.supports_interface(ERC2981_ID)
            } else {
                self.royalty_support.read(collection)
            };
            self.collections.write(collection, enabled);
            self.royalty_support.write(collection, royalties);
            self.emit(CollectionPolicyChanged { collection, enabled, royalties });
            self.unlock();
        }
        fn set_currency(ref self: ContractState, currency: ContractAddress, enabled: bool) {
            self.lock();
            self.only_admin();
            assert(currency != zero(), 'ZERO_ADDRESS');
            self.currencies.write(currency, enabled);
            self.emit(CurrencyPolicyChanged { currency, enabled });
            self.unlock();
        }
        fn set_paused(ref self: ContractState, paused: bool) {
            self.lock();
            self.only_admin();
            self.paused.write(paused);
            self.emit(TradingChanged { paused });
            self.unlock();
        }
        fn propose_admin(ref self: ContractState, admin: ContractAddress) {
            self.lock();
            self.only_admin();
            assert(admin != zero(), 'ZERO_ADDRESS');
            self.pending_admin.write(admin);
            self.emit(AdminProposed { admin });
            self.unlock();
        }
        fn accept_admin(ref self: ContractState) {
            self.lock();
            let admin = get_caller_address();
            assert(admin == self.pending_admin.read() && admin != zero(), 'NOT_PENDING_ADMIN');
            let previous = self.admin.read();
            self.admin.write(admin);
            self.pending_admin.write(zero());
            self.emit(AdminTransferred { previous, admin });
            self.unlock();
        }
    }
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn lock(ref self: ContractState) {
            assert(!self.entered.read(), 'REENTRANCY');
            self.entered.write(true);
        }
        fn unlock(ref self: ContractState) {
            self.entered.write(false);
        }
        fn only_admin(self: @ContractState) {
            assert(get_caller_address() == self.admin.read(), 'NOT_ADMIN');
        }
        fn trading(self: @ContractState, collection: ContractAddress, currency: ContractAddress) {
            assert(!self.paused.read(), 'PAUSED');
            assert(self.collections.read(collection), 'COLLECTION_DISABLED');
            assert(self.currencies.read(currency), 'CURRENCY_DISABLED');
        }
        fn royalty(
            self: @ContractState, collection: ContractAddress, token_id: u256, price: u256,
        ) -> (ContractAddress, u256) {
            if !self.royalty_support.read(collection) {
                return (zero(), 0);
            }
            let (receiver, amount) = ITokenDispatcher { contract_address: collection }
                .royalty_info(token_id, price);
            assert(amount == 0 || receiver != zero(), 'ROYALTY_RECEIVER');
            (receiver, amount)
        }
        fn create(
            ref self: ContractState,
            kind: u8,
            collection: ContractAddress,
            token_id: u256,
            currency: ContractAddress,
            buyer_debit: u256,
            expiry: u64,
            max_royalty: u256,
        ) -> u64 {
            self.trading(collection, currency);
            assert(expiry > get_block_timestamp(), 'EXPIRED');
            let maker = get_caller_address();
            assert(maker != zero(), 'ZERO_ADDRESS');
            let (receiver, amount) = if kind == 3 {
                (zero(), 0)
            } else {
                let owner = ITokenDispatcher { contract_address: collection }.owner_of(token_id);
                assert(owner != zero(), 'MISSING_TOKEN');
                if kind == 1 {
                    assert(owner == maker, 'NOT_OWNER');
                }
                self.royalty(collection, token_id, buyer_debit)
            };
            assert(amount <= max_royalty, 'ROYALTY_CAP');
            payouts(buyer_debit, self.fee_bps.read(), if kind == 3 {
                max_royalty
            } else {
                amount
            });
            let nonce = self.nonces.read(maker) + 1;
            self.nonces.write(maker, nonce);
            let terms = Terms {
                kind,
                collection,
                token_id,
                currency,
                buyer_debit,
                expiry,
                royalty_cap: max_royalty,
                royalty_recipient: receiver,
                royalty_amount: amount,
            };
            self.terms.write((maker, nonce), terms);
            self.states.write((maker, nonce), 1);
            self.emit(OrderCreated { maker, nonce, terms });
            nonce
        }
        fn cancel(ref self: ContractState, nonce: u64) {
            let maker = get_caller_address();
            let state = self.states.read((maker, nonce));
            if state == 3 {
                return;
            }
            assert(state == 1, 'NOT_OPEN');
            self.states.write((maker, nonce), 3);
            self.emit(OrderCancelled { maker, nonce });
        }
        fn checked(
            self: @ContractState, key: OrderKey, currency: ContractAddress, kind: u8,
        ) -> Terms {
            assert(self.states.read((key.maker, key.nonce)) == 1, 'NOT_OPEN');
            let terms = self.terms.read((key.maker, key.nonce));
            self.trading(terms.collection, currency);
            assert(terms.currency == currency, 'CURRENCY_MISMATCH');
            assert(terms.kind == kind, 'WRONG_KIND');
            assert(get_block_timestamp() < terms.expiry, 'EXPIRED');
            assert(key.maker != get_caller_address(), 'SELF_TRADE');
            terms
        }
        fn check_nft(
            self: @ContractState,
            collection: ContractAddress,
            token_id: u256,
            seller: ContractAddress,
        ) {
            let token = ITokenDispatcher { contract_address: collection };
            let market = get_contract_address();
            assert(token.owner_of(token_id) == seller, 'NOT_OWNER');
            assert(
                token.is_approved_for_all(seller, market) || token.get_approved(token_id) == market,
                'NOT_APPROVED',
            );
        }
        fn buy(
            ref self: ContractState,
            keys: Span<OrderKey>,
            currency: ContractAddress,
            max_total: u256,
            deadline: u64,
        ) {
            assert(keys.len() > 0 && keys.len() <= 25, 'BATCH_SIZE');
            assert(get_block_timestamp() < deadline, 'DEADLINE');
            let mut total: u256 = 0;
            let mut orders: Array<Terms> = array![];
            for i in 0..keys.len() {
                let key = *keys.at(i);
                let terms = self.checked(key, currency, 1);
                for j in 0..i {
                    let previous = *orders.at(j);
                    assert(
                        previous.collection != terms.collection
                            || previous.token_id != terms.token_id,
                        'DUPLICATE_NFT',
                    );
                }
                self.check_nft(terms.collection, terms.token_id, key.maker);
                total += terms.buyer_debit;
                orders.append(terms);
            }
            assert(total <= max_total, 'MAX_TOTAL');
            for key in keys {
                self.states.write((*key.maker, *key.nonce), 2);
            }
            let buyer = get_caller_address();
            for i in 0..keys.len() {
                let key = *keys.at(i);
                let terms = *orders.at(i);
                self
                    .settle(
                        key,
                        terms,
                        terms.token_id,
                        buyer,
                        key.maker,
                        terms.royalty_recipient,
                        terms.royalty_amount,
                        0,
                    );
            };
        }
        fn accept(
            ref self: ContractState,
            key: OrderKey,
            terms: Terms,
            token_id: u256,
            min_proceeds: u256,
        ) {
            let seller = get_caller_address();
            self.check_nft(terms.collection, token_id, seller);
            let (receiver, amount) = if terms.kind == 3 {
                self.royalty(terms.collection, token_id, terms.buyer_debit)
            } else {
                (terms.royalty_recipient, terms.royalty_amount)
            };
            assert(amount <= terms.royalty_cap, 'ROYALTY_CAP');
            self.states.write((key.maker, key.nonce), 2);
            self.settle(key, terms, token_id, key.maker, seller, receiver, amount, min_proceeds);
        }
        fn pay(
            self: @ContractState,
            currency: ContractAddress,
            buyer: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            if amount == 0 || buyer == recipient {
                return;
            }
            assert(
                ICurrencyDispatcher { contract_address: currency }
                    .transfer_from(buyer, recipient, amount),
                'PAYMENT_FAILED',
            );
        }
        fn settle(
            ref self: ContractState,
            key: OrderKey,
            terms: Terms,
            token_id: u256,
            buyer: ContractAddress,
            seller: ContractAddress,
            royalty_recipient: ContractAddress,
            royalty_amount: u256,
            min_proceeds: u256,
        ) {
            let (protocol_fee, seller_proceeds) = payouts(
                terms.buyer_debit, self.fee_bps.read(), royalty_amount,
            );
            assert(seller_proceeds >= min_proceeds, 'MIN_PROCEEDS');
            let fee_recipient = self.fee_recipient.read();
            self.pay(terms.currency, buyer, seller, seller_proceeds);
            self.pay(terms.currency, buyer, fee_recipient, protocol_fee);
            self.pay(terms.currency, buyer, royalty_recipient, royalty_amount);
            ITokenDispatcher { contract_address: terms.collection }
                .safe_transfer_from(seller, buyer, token_id, array![].span());
            self
                .emit(
                    OrderFilled {
                        maker: key.maker,
                        nonce: key.nonce,
                        buyer,
                        seller,
                        collection: terms.collection,
                        token_id,
                        currency: terms.currency,
                        buyer_debit: terms.buyer_debit,
                        seller_proceeds,
                        protocol_fee,
                        fee_recipient,
                        royalty_amount,
                        royalty_recipient,
                    },
                );
        }
    }
}

#[cfg(feature: "fixtures")]
pub mod mocks;
