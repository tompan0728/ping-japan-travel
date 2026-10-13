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
    <section className="w-full max-w-md rounded-[28px] border border-[#c7dce8] bg-[#fbfdff] p-5 text-slate-800 shadow-[0_18px_45px_rgba(28,74,105,0.10)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf5fb] text-[#15577f]">
            <LockKeyhole size={22} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#173b59]">管理者登入</h2>
            <p className="text-sm text-[#60798b]">旅伴不用登入，只有編輯行程需要管理者帳號。</p>
          </div>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]">
            <X size={16} />
          </button>
        )}
      </div>

      {!isSupabaseConfigured ? (
        <div className="rounded-2xl bg-[#fff1df] p-4 text-sm leading-6 text-[#995522]">
          尚未設定 Supabase。請先建立 `.env.local`，填入 `VITE_SUPABASE_URL` 和
          `VITE_SUPABASE_ANON_KEY`。
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#587286]">Email</span>
            <span className="flex h-12 items-center gap-2 rounded-2xl border border-[#cbdfe9] bg-[#f4f9fc] px-3">
              <Mail size={18} className="text-[#8199a9]" />
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
            <span className="mb-1.5 block text-xs font-medium text-[#587286]">密碼</span>
            <span className="flex h-12 items-center gap-2 rounded-2xl border border-[#cbdfe9] bg-[#f4f9fc] px-3">
              <KeyRound size={18} className="text-[#8199a9]" />
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
            <div className="rounded-2xl bg-[#edf5f8] px-3 py-2 text-sm text-[#526f85]">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#176fa5] px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            <LogIn size={18} />
            {isSubmitting ? '登入中...' : '登入管理者'}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-2xl border border-[#c7dce8] px-4 py-3 text-sm font-medium text-[#28475d]"
            >
              返回觀看模式
            </button>
          )}
        </form>
      )}
    </section>
  )
}
