import { create } from 'zustand'

interface ToastStore {
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[]
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now().toString()
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
