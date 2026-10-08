// Test-only assets. Not deployed by production tooling.
use starknet::ContractAddress;
#[starknet::interface]
pub trait IMock<T> {
    fn mint(ref self: T, to: ContractAddress, id: u256);
    fn approve(ref self: T, spender: ContractAddress, amount: u256);
    fn set_approval(ref self: T, token_id: u256, spender: ContractAddress);
    fn set_royalty(ref self: T, recipient: ContractAddress, amount: u256);
    fn set_failure(ref self: T, fail: bool);
    fn balance_of(self: @T, who: ContractAddress) -> u256;
    fn owner_of(self: @T, id: u256) -> ContractAddress;
}
#[starknet::contract]
pub mod MockCurrency {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::{IMarketplaceDispatcher, IMarketplaceDispatcherTrait};
    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        fail: bool,
        reentry_market: ContractAddress,
        reentry_nonce: u64,
        false_after_recipient: ContractAddress,
    }
    #[abi(embed_v0)]
    impl Currency of crate::ICurrency<ContractState> {
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            if self.fail.read() {
                return false;
            }
            let key = (sender, get_caller_address());
            let allowance = self.allowances.read(key);
            assert(allowance >= amount, 'ALLOWANCE');
            assert(self.balances.read(sender) >= amount, 'BALANCE');
            self.allowances.write(key, allowance - amount);
            self.balances.write(sender, self.balances.read(sender) - amount);
            self.balances.write(recipient, self.balances.read(recipient) + amount);
            if self.reentry_market.read() != crate::zero() {
                IMarketplaceDispatcher { contract_address: self.reentry_market.read() }
                    .cancel_order(self.reentry_nonce.read());
            }
            recipient != self.false_after_recipient.read()
        }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }
        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.read((owner, spender))
        }
    }
    #[external(v0)]
    fn mint(ref self: ContractState, to: ContractAddress, id: u256) {
        self.balances.write(to, self.balances.read(to) + id);
    }
    #[external(v0)]
    fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) {
        self.allowances.write((get_caller_address(), spender), amount);
    }
    #[external(v0)]
    fn set_failure(ref self: ContractState, fail: bool) {
        self.fail.write(fail);
    }
    #[external(v0)]
    fn set_false_after_recipient(ref self: ContractState, recipient: ContractAddress) {
        self.false_after_recipient.write(recipient);
    }
    #[external(v0)]
    fn set_payment_reentry(ref self: ContractState, market: ContractAddress, nonce: u64) {
        self.reentry_market.write(market);
        self.reentry_nonce.write(nonce);
    }
}
#[starknet::contract]
pub mod MockNft {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::{IMarketplaceDispatcher, IMarketplaceDispatcherTrait};
    use super::{IReceiverDispatcher, IReceiverDispatcherTrait};
    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
        approvals: Map<u256, ContractAddress>,
        recipient: ContractAddress,
        amount: u256,
        fail: bool,
        fail_token: u256,
        fail_token_enabled: bool,
        reentry_market: ContractAddress,
        reentry_currency: ContractAddress,
        receiver_checks: bool,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }
    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        #[key]
        pub token_id: u256,
    }
    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        #[key]
        pub owner: ContractAddress,
        #[key]
        pub approved: ContractAddress,
        #[key]
        pub token_id: u256,
    }
    #[abi(embed_v0)]
    impl Token of crate::IToken<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == crate::ERC721_ID || interface_id == crate::ERC2981_ID
        }
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.read(token_id)
        }
        fn get_approved(self: @ContractState, token_id: u256) -> ContractAddress {
            self.approvals.read(token_id)
        }
        fn is_approved_for_all(
            self: @ContractState, owner: ContractAddress, operator: ContractAddress,
        ) -> bool {
            false
        }
        fn safe_transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
            data: Span<felt252>,
        ) {
            assert(
                !self.fail.read()
                    && (!self.fail_token_enabled.read() || self.fail_token.read() != token_id),
                'NFT_FAILURE',
            );
            assert(self.owners.read(token_id) == from, 'OWNER');
            assert(self.approvals.read(token_id) == get_caller_address(), 'APPROVAL');
            self.owners.write(token_id, to);
            self.approvals.write(token_id, crate::zero());
            self.emit(Transfer { from, to, token_id });
            if self.receiver_checks.read() {
                let response = IReceiverDispatcher { contract_address: to }
                    .on_erc721_received(get_caller_address(), from, token_id, data);
                assert(response == super::RECEIVER_ID, 'BAD_RECEIVER');
            }
            if self.reentry_market.read() != crate::zero() {
                IMarketplaceDispatcher { contract_address: self.reentry_market.read() }
                    .create_collection_offer(
                        starknet::get_contract_address(),
                        self.reentry_currency.read(),
                        100,
                        1000,
                        5,
                        500,
                    );
            }
        }
        fn royalty_info(
            self: @ContractState, token_id: u256, sale_price: u256,
        ) -> (ContractAddress, u256) {
            (self.recipient.read(), self.amount.read())
        }
    }
    #[external(v0)]
    fn mint(ref self: ContractState, to: ContractAddress, id: u256) {
        self.owners.write(id, to);
        self.emit(Transfer { from: crate::zero(), to, token_id: id });
    }
    #[external(v0)]
    fn approve(ref self: ContractState, spender: ContractAddress, token_id: u256) {
        assert(self.owners.read(token_id) == get_caller_address(), 'OWNER');
        self.approvals.write(token_id, spender);
        self.emit(Approval { owner: get_caller_address(), approved: spender, token_id });
    }
    #[external(v0)]
    fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
        "data:application/json,%7B%22name%22%3A%22Local%20NFT%22%7D"
    }
    #[external(v0)]
    fn set_approval(ref self: ContractState, token_id: u256, spender: ContractAddress) {
        assert(self.owners.read(token_id) == get_caller_address(), 'OWNER');
        self.approvals.write(token_id, spender);
        self.emit(Approval { owner: get_caller_address(), approved: spender, token_id });
    }
    #[external(v0)]
    fn set_reentry(ref self: ContractState, market: ContractAddress, currency: ContractAddress) {
        self.reentry_market.write(market);
        self.reentry_currency.write(currency);
    }
    #[external(v0)]
    fn fail_on_token(ref self: ContractState, token_id: u256) {
        self.fail_token.write(token_id);
        self.fail_token_enabled.write(true);
    }
    #[external(v0)]
    fn set_royalty(ref self: ContractState, recipient: ContractAddress, amount: u256) {
        self.recipient.write(recipient);
        self.amount.write(amount);
    }
    #[external(v0)]
    fn set_failure(ref self: ContractState, fail: bool) {
        self.fail.write(fail);
    }
    #[external(v0)]
    fn set_receiver_checks(ref self: ContractState, enabled: bool) {
        self.receiver_checks.write(enabled);
    }
}

// Receiver callback fixture: standard callback ABI, not a complete production ERC721/account.
pub const RECEIVER_ID: felt252 = 0x3a0dff5f70d80458ad14ae37bb182a728e3c8cdda0402a5daa86620bdf910bc;
#[starknet::interface]
pub trait IReceiver<T> {
    fn on_erc721_received(
        ref self: T,
        operator: ContractAddress,
        from: ContractAddress,
        token_id: u256,
        data: Span<felt252>,
    ) -> felt252;
}
#[starknet::contract]
pub mod ReceiverProbe {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::call_contract_syscall;
    use starknet::{ContractAddress, SyscallResultTrait};
    #[storage]
    struct Storage {
        target: ContractAddress,
        selector: felt252,
        data: Map<u32, felt252>,
        len: u32,
        reject: bool,
    }
    #[external(v0)]
    fn configure(
        ref self: ContractState,
        target: ContractAddress,
        selector: felt252,
        data: Span<felt252>,
        reject: bool,
    ) {
        self.target.write(target);
        self.selector.write(selector);
        self.len.write(data.len());
        self.reject.write(reject);
        for i in 0..data.len() {
            self.data.write(i, *data.at(i));
        }
    }
    #[external(v0)]
    fn run(
        ref self: ContractState, target: ContractAddress, selector: felt252, data: Span<felt252>,
    ) {
        call_contract_syscall(target, selector, data).unwrap_syscall();
    }
    #[abi(embed_v0)]
    impl Receiver of super::IReceiver<ContractState> {
        fn on_erc721_received(
            ref self: ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_id: u256,
            data: Span<felt252>,
        ) -> felt252 {
            if self.reject.read() {
                return 0;
            }
            if self.selector.read() != 0 {
                let mut payload = array![];
                for i in 0..self.len.read() {
                    payload.append(self.data.read(i));
                }
                call_contract_syscall(self.target.read(), self.selector.read(), payload.span())
                    .unwrap_syscall();
            }
            super::RECEIVER_ID
        }
    }
}
