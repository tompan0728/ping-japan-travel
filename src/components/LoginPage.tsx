import { useState, type FormEvent } from 'react'
import { KeyRound, LockKeyhole, LogIn, Mail, Plane, UserPlus } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type LoginMode = 'sign-in' | 'sign-up'

const authCopy = {
  'sign-in': {
    title: '登入旅遊手冊',
    subtitle: '輸入帳號後就能讀取同一份雲端行程資料。',
    action: '登入',
    switchText: '還沒有帳號？建立一個',
    icon: LogIn,
  },
  'sign-up': {
    title: '建立旅伴帳號',
    subtitle: '註冊後即可用同一個網站查看最新行程。',
    action: '建立帳號',
    switchText: '已經有帳號？回到登入',
    icon: UserPlus,
  },
} satisfies Record<LoginMode, {
  title: string
  subtitle: string
  action: string
  switchText: string
  icon: typeof LogIn
}>

export function LoginPage() {
  const [mode, setMode] = useState<LoginMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const copy = authCopy[mode]
  const ActionIcon = copy.icon

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')

    if (!supabase) return

    setIsSubmitting(true)
    const credentials = {
      email: email.trim(),
      password,
    }

    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials)

    setIsSubmitting(false)

    if (error) {
      setMessage(error.message)
      return
    }

    if (mode === 'sign-up' && !data.session) {
      setMessage('帳號已建立。若 Supabase 有開啟信箱驗證，請先到信箱完成確認。')
      return
    }

    setMessage('登入成功，正在載入旅遊資料。')
  }

  return (
    <div className="min-h-screen bg-[#f5f0ea] text-slate-800">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-5">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d74d4d] text-white shadow-sm">
            <Plane size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-[#b23b3b]">Tokyo Friends Trip</p>
            <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight text-[#1f2937] sm:text-5xl">
              東京 9 人朋友行
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[#5f6b7a]">
              登入後會從資料庫讀取最新版本。管理者更新行程後，旅伴重新整理就能看到同一份內容。
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#eadfd8] bg-[#fffdfa] p-5 shadow-[0_18px_45px_rgba(90,67,53,0.08)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0ef] text-[#b23b3b]">
              <LockKeyhole size={22} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[#1f2937]">{copy.title}</h2>
              <p className="text-sm text-[#6b7280]">{copy.subtitle}</p>
            </div>
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
                    placeholder="you@example.com"
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
                    placeholder="至少 6 個字元"
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
                <ActionIcon size={18} />
                {isSubmitting ? '處理中...' : copy.action}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'))
                  setMessage('')
                }}
                className="w-full rounded-2xl border border-[#eadfd8] px-4 py-3 text-sm font-medium text-[#524743]"
              >
                {copy.switchText}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

