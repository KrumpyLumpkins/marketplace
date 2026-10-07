import {canAddCartItem,compareAmounts as compareBigIntStrings} from "@biblio/marketplace";
export {CART_MAX_ITEMS} from "@biblio/marketplace";
import { createStore } from "zustand/vanilla";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const CART_STORAGE_KEY = "marketplace-cart-v2";

export type CartItem = {
  orderId: string;
  collection: string;
  tokenId: string;
  price: string;
  currency: string;
  quantity: string;
  projectId?: string;
  tokenName?: string;
  tokenImage?: string | null;
};

export type CartActionResult = {
  ok: boolean;
  error?: string;
};

type CartStoreState = {
  items: CartItem[];
  isOpen: boolean;
  inlineErrors: Record<string, string>;
  lastActionError: string | null;
  addItem: (item: CartItem) => CartActionResult;
  addCandidates: (candidates: CartItem[]) => CartActionResult;
  removeItem: (orderId: string) => void;
  clearCart: () => void;
  setOpen: (open: boolean) => void;
  setItemError: (orderId: string, error: string) => void;
  clearItemError: (orderId: string) => void;
  clearInlineErrors: () => void;
  clearActionError: () => void;
};

function legacyCartNotice() {
  if(typeof localStorage==='undefined')return null;
  try {return localStorage.getItem('marketplace-cart-v1')&&!localStorage.getItem(CART_STORAGE_KEY)?'Items from the previous marketplace were cleared. Add current listings to use the new contract.':null;}catch{return null;}
}

const createState = persist<CartStoreState>(
  (set, get) => ({
    items: [],
    isOpen: false,
    inlineErrors: {},
    lastActionError: legacyCartNotice(),
    addItem: (item) => {
      const result = canAddCartItem(get().items, item);
      if (!result.ok) {
        set({ lastActionError: result.error ?? "Failed to add item." });
        return result;
      }

      set((state) => ({
        items: state.items.some((entry) => entry.orderId === item.orderId)
          ? state.items
          : [...state.items, item],
        lastActionError: null,
      }));

      return { ok: true };
    },
    addCandidates: (candidates) => {
      const ordered = [...candidates].sort((left, right) =>
        compareBigIntStrings(left.price, right.price),
      );
      let firstError: string | undefined;

      for (const candidate of ordered) {
        const result = get().addItem(candidate);
        if (!result.ok && !firstError) {
          firstError = result.error;
        }
      }

      return firstError ? { ok: false, error: firstError } : { ok: true };
    },
    removeItem: (orderId) => {
      set((state) => {
        if (!(orderId in state.inlineErrors)) {
          return {
            items: state.items.filter((item) => item.orderId !== orderId),
          };
        }

        const nextInlineErrors = { ...state.inlineErrors };
        delete nextInlineErrors[orderId];

        return {
          items: state.items.filter((item) => item.orderId !== orderId),
          inlineErrors: nextInlineErrors,
        };
      });
    },
    clearCart: () => {
      set({ items: [], inlineErrors: {}, lastActionError: null });
    },
    setOpen: (open) => {
      set({ isOpen: open });
    },
    setItemError: (orderId, error) => {
      set((state) => ({
        inlineErrors: {
          ...state.inlineErrors,
          [orderId]: error,
        },
      }));
    },
    clearItemError: (orderId) => {
      set((state) => {
        if (!(orderId in state.inlineErrors)) {
          return state;
        }

        const nextInlineErrors = { ...state.inlineErrors };
        delete nextInlineErrors[orderId];

        return { inlineErrors: nextInlineErrors };
      });
    },
    clearInlineErrors: () => {
      set({ inlineErrors: {} });
    },
    clearActionError: () => {
      set({ lastActionError: null });
    },
  }),
  {
    name: CART_STORAGE_KEY,
    storage: createJSONStorage(() => localStorage),
  },
);

export function createCartStore() {
  return createStore<CartStoreState>()(createState);
}

export const cartStore = createCartStore();

export const useCartStore = create<CartStoreState>()(createState);

export type { CartStoreState };
