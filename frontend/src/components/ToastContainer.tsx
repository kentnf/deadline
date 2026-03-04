import { useToastStore } from '../stores/toastStore'

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            maxWidth: 320,
            background: t.type === 'error' ? '#ff4d4f' : t.type === 'success' ? '#52c41a' : '#1890ff',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
