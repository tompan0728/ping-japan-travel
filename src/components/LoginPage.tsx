import { useState, type FormEvent } from 'react'
import { KeyRound, LockKeyhole, LogIn, Mail, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type LoginPageProps = {
  onCancel?: () => void
}

export function LoginPage({ onCancel }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')

    if (!supabase) return

    setIsSubmitting(true)
    const credentials = {
      email: email.trim(),
      password,
    }

    const { error } = await supabase.auth.signInWithPassword(credentials)

    setIsSubmitting(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('登入成功，正在確認管理者權限。')
  }

  return (
    <section className="w-full max-w-md rounded-[28px] border border-[#eadfd8] bg-[#fffdfa] p-5 text-slate-800 shadow-[0_18px_45px_rgba(90,67,53,0.08)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0ef] text-[#b23b3b]">
            <LockKeyhole size={22} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#1f2937]">管理者登入</h2>
            <p className="text-sm text-[#6b7280]">旅伴不用登入，只有編輯行程需要管理者帳號。</p>
          </div>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]">
            <X size={16} />
          </button>
        )}
      </div>

      {!isSupabaseConfigured ? (
        <div className="rounded-2xl bg-[#fff3f1] p-4 text-sm leading-6 text-[#8f3c32]">
          尚未設定 Supabase。請先建立 `.env.local`，填入 `VITE_SUPABASE_URL` 和
          `VITE_SUPABASE_ANON_KEY`。
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#7a6a62]">Email</span>
            <span className="flex h-12 items-center gap-2 rounded-2xl border border-[#eddfdb] bg-[#fffaf8] px-3">
              <Mail size={18} className="text-[#9b8b83]" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="admin@example.com"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#7a6a62]">密碼</span>
            <span className="flex h-12 items-center gap-2 rounded-2xl border border-[#eddfdb] bg-[#fffaf8] px-3">
              <KeyRound size={18} className="text-[#9b8b83]" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="管理者密碼"
              />
            </span>
          </label>

          {message && (
            <div className="rounded-2xl bg-[#f7f2ee] px-3 py-2 text-sm text-[#5f6b7a]">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#d74d4d] px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            <LogIn size={18} />
            {isSubmitting ? '登入中...' : '登入管理者'}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-2xl border border-[#eadfd8] px-4 py-3 text-sm font-medium text-[#524743]"
            >
              返回觀看模式
            </button>
          )}
        </form>
      )}
    </section>
  )
}

