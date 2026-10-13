import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Hotel,
  Home,
  Loader2,
  LogOut,
  NotebookPen,
  Plane,
  Plus,
  RefreshCcw,
  Settings,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type {
  ItineraryItem,
  NoteItem,
  PageKey,
  Restaurant,
  ShoppingItem,
  TravelAppData,
  TravelInfoItem,
} from './types'
import { itinerarySample } from './data/itinerary'
import { notesSample } from './data/notes'
import { placesSample } from './data/places'
import { restaurantsSample } from './data/restaurants'
import { shoppingSample } from './data/shopping'
import { tripSample } from './data/trip'
import { travelInfoSample } from './data/travelInfo'
import { LoginPage } from './components/LoginPage'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { checkIsAdmin, loadTravelData, saveTravelData } from './lib/travelDataStore'

const STORAGE_KEY = 'tokyo-trip-app-v2'
const LEGACY_STORAGE_KEY = 'tokyo-trip-app-v1'
const OWNER_ACCESS_KEY = 'tokyo-trip-owner-access'
const OWNER_ACCESS_CODE = 'tompan'

const buildSampleData = (): TravelAppData => ({
  trip: tripSample,
  itineraryDays: itinerarySample,
  places: placesSample,
  shoppingItems: shoppingSample,
  restaurants: restaurantsSample,
  travelInfo: travelInfoSample,
  notes: notesSample,
})

const navItems: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: 'home', label: '首頁', icon: Home },
  { key: 'itinerary', label: '行程', icon: CalendarDays },
  { key: 'info', label: '資訊', icon: Plane },
  { key: 'notes', label: '備忘', icon: NotebookPen },
  { key: 'settings', label: '設定', icon: Settings },
]

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const formatYen = (value: number) => `¥${value.toLocaleString('ja-JP')}`
const googleMapsLink = (value: string) =>
  `https://maps.google.com/?q=${encodeURIComponent(value)}`

const emptyItineraryItem = (): ItineraryItem => ({
  id: createId(),
  title: '',
  category: '景點',
  startTime: '09:00',
  address: '',
  duration: '1 小時',
  transport: '步行',
  notes: '',
  link: '',
  completed: false,
})

const emptyShoppingItem = (): ShoppingItem => ({
  id: createId(),
  name: '',
  brand: '',
  area: '淺草',
  preferredStore: '',
  budget: 3000,
  actualPrice: 0,
  status: '待購買',
  notes: '',
})

const emptyRestaurant = (): Restaurant => ({
  id: createId(),
  name: '',
  type: '日式料理',
  address: '',
  area: '淺草',
  budget: '¥1,000 - ¥2,000',
  hours: '待確認',
  reservation: '可視情況',
  link: '',
  notes: '',
  favorite: false,
  confirmed: false,
})

const emptyInfoItem = (): TravelInfoItem => ({
  id: createId(),
  title: '',
  content: '待填寫',
  badge: '待填寫',
})

const emptyNote = (): NoteItem => ({
  id: createId(),
  title: '',
  content: '',
  createdAt: new Date().toISOString().slice(0, 10),
})

function App() {
  const [appData, setAppData] = useState<TravelAppData>(() => {
    if (typeof window === 'undefined') return buildSampleData()

    const currentRaw = window.localStorage.getItem(STORAGE_KEY)
    if (currentRaw) {
      try {
        return JSON.parse(currentRaw) as TravelAppData
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    }

    return buildSampleData()
  })

  const [ownerAccess, setOwnerAccess] = useState<'owner' | 'guest'>(() => {
    if (typeof window === 'undefined') return 'guest'

    const saved = window.localStorage.getItem(OWNER_ACCESS_KEY)
    return saved === 'owner' ? 'owner' : 'guest'
  })
  const [ownerCodeInput, setOwnerCodeInput] = useState('')
  const [showOwnerGate, setShowOwnerGate] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured)
  const [isDataLoading, setIsDataLoading] = useState(isSupabaseConfigured)
  const [isRemoteAdmin, setIsRemoteAdmin] = useState(false)
  const [syncMessage, setSyncMessage] = useState(
    isSupabaseConfigured ? '準備連線到雲端資料庫' : '本機模式',
  )
  const skipNextRemoteSave = useRef(false)

  const canEdit = isSupabaseConfigured ? isRemoteAdmin : ownerAccess === 'owner'

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => setDeferredPrompt(null)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setIsAuthLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        setIsDataLoading(true)
        setSyncMessage('正在讀取雲端資料')
      }
      if (!nextSession) {
        setIsRemoteAdmin(false)
        setIsDataLoading(true)
        setSyncMessage('正在讀取公開行程')
      }
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || isAuthLoading) return

    let isMounted = true

    Promise.all([
      loadTravelData(),
      session ? checkIsAdmin(session.user.id) : Promise.resolve(false),
    ])
      .then(([remoteData, isAdmin]) => {
        if (!isMounted) return

        setIsRemoteAdmin(isAdmin)
        if (isAdmin) setShowOwnerGate(false)

        if (remoteData) {
          skipNextRemoteSave.current = true
          setAppData(remoteData)
          setSyncMessage(session ? '已載入雲端資料' : '已載入公開行程')
          return
        }

        setSyncMessage(
          isAdmin
            ? '雲端尚未建立資料，第一次修改後會建立'
            : '雲端尚未建立資料，暫時顯示本機範例',
        )
      })
      .catch((error: Error) => {
        if (!isMounted) return
        setSyncMessage(`雲端讀取失敗：${error.message}`)
      })
      .finally(() => {
        if (isMounted) setIsDataLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isAuthLoading, session])

  const handleInstallApp = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice

    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const handleSignOut = async () => {
    if (!supabase) return

    await supabase.auth.signOut()
    setSession(null)
    setIsRemoteAdmin(false)
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(OWNER_ACCESS_KEY, ownerAccess)
    }
  }, [ownerAccess])

  const unlockOwnerAccess = () => {
    if (isSupabaseConfigured) {
      window.alert('這個版本使用登入帳號管理權限，請在 Supabase 的 app_admins 表加入管理者。')
      return
    }

    if (ownerCodeInput.trim() === OWNER_ACCESS_CODE) {
      setOwnerAccess('owner')
      setShowOwnerGate(false)
      setOwnerCodeInput('')
      return
    }

    window.alert('管理者編碼錯誤，請確認後再試。')
  }

  const exitOwnerAccess = () => {
    if (isSupabaseConfigured) {
      void handleSignOut()
      return
    }

    setOwnerAccess('guest')
    setShowOwnerGate(true)
  }

  const [activePage, setActivePage] = useState<PageKey>('home')
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [infoCategory, setInfoCategory] = useState<'旅遊資訊' | '美食' | '購物'>('旅遊資訊')
  const [shoppingStatusFilter, setShoppingStatusFilter] = useState<'全部' | '待購買' | '已購買'>('全部')
  const [shoppingRegionFilter, setShoppingRegionFilter] = useState('全部')
  const [restaurantFilter, setRestaurantFilter] = useState('全部')
  const [restaurantSearch, setRestaurantSearch] = useState('')
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false)
  const [tripDraft, setTripDraft] = useState(appData.trip)
  const [itineraryDraft, setItineraryDraft] = useState<ItineraryItem | null>(null)
  const [shoppingDraft, setShoppingDraft] = useState<ShoppingItem | null>(null)
  const [restaurantDraft, setRestaurantDraft] = useState<Restaurant | null>(null)
  const [travelInfoDraft, setTravelInfoDraft] = useState<TravelInfoItem | null>(null)
  const [noteDraft, setNoteDraft] = useState<NoteItem | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appData))
    }

    if (!isSupabaseConfigured || !session || !canEdit || isDataLoading) return

    if (skipNextRemoteSave.current) {
      skipNextRemoteSave.current = false
      return
    }

    const saveTimer = window.setTimeout(() => {
      setSyncMessage('正在儲存到雲端')
      saveTravelData(appData)
        .then(() => {
          const savedAt = new Date().toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
          })
          setSyncMessage(`雲端已儲存 ${savedAt}`)
        })
        .catch((error: Error) => {
          setSyncMessage(`雲端儲存失敗：${error.message}`)
        })
    }, 700)

    return () => window.clearTimeout(saveTimer)
  }, [appData, canEdit, isDataLoading, session])

  const selectedDay =
    appData.itineraryDays[selectedDayIndex] ?? appData.itineraryDays[0]

  const nextItem =
    selectedDay?.items.find((item) => !item.completed) ?? selectedDay?.items[0]

  const todayLabel = new Date().toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })

  const filteredRestaurants = useMemo(() => {
    return appData.restaurants.filter((item) => {
      const matchesCategory =
        restaurantFilter === '全部' || item.type === restaurantFilter
      const matchesSearch =
        item.name.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
        item.area.toLowerCase().includes(restaurantSearch.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [appData.restaurants, restaurantFilter, restaurantSearch])

  const saveTripInfo = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    setAppData((previous) => ({
      ...previous,
      trip: {
        ...tripDraft,
        tripName: tripDraft.tripName.trim() || '我的旅行',
        subtitle: tripDraft.subtitle.trim() || 'Travel Guide',
        travelDates: tripDraft.travelDates.trim() || '待填寫',
        hotelName: tripDraft.hotelName.trim() || '待填寫飯店',
        hotelAddress: tripDraft.hotelAddress.trim() || '待填寫地址',
      },
    }))
    setIsTripEditorOpen(false)
  }

  const restoreSampleData = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    setAppData(buildSampleData())
    setSelectedDayIndex(0)
    setExpandedItemId(null)
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], {
      type: 'application/json',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'tokyo-travel-data.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) {
      setShowOwnerGate(true)
      event.target.value = ''
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? 'null')) as TravelAppData
        setAppData(parsed)
      } catch {
        window.alert('匯入失敗，請確認 JSON 檔案格式正確。')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const updateItineraryItem = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    if (!itineraryDraft) return

    const cleanedTitle = itineraryDraft.title.trim()
    if (!cleanedTitle) return

    const normalizedDraft = {
      ...itineraryDraft,
      title: cleanedTitle,
      address: itineraryDraft.address || '待填寫',
      notes: itineraryDraft.notes || '待補充說明',
      link: itineraryDraft.link || googleMapsLink(itineraryDraft.address || itineraryDraft.title),
    }

    setAppData((previous) => ({
      ...previous,
      itineraryDays: previous.itineraryDays.map((day, index) => {
        if (index !== selectedDayIndex) return day

        const currentItems = day.items.map((item) =>
          item.id === normalizedDraft.id ? normalizedDraft : item,
        )

        if (!day.items.some((item) => item.id === normalizedDraft.id)) {
          currentItems.push({ ...normalizedDraft, id: normalizedDraft.id || createId() })
        }

        return { ...day, items: currentItems }
      }),
    }))

    setItineraryDraft(null)
  }

  const removeItineraryItem = (id: string) => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    setAppData((previous) => ({
      ...previous,
      itineraryDays: previous.itineraryDays.map((day, index) =>
        index === selectedDayIndex
          ? { ...day, items: day.items.filter((item) => item.id !== id) }
          : day,
      ),
    }))
  }

  const toggleItineraryComplete = (id: string) => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    setAppData((previous) => ({
      ...previous,
      itineraryDays: previous.itineraryDays.map((day, index) =>
        index === selectedDayIndex
          ? {
              ...day,
              items: day.items.map((item) =>
                item.id === id ? { ...item, completed: !item.completed } : item,
              ),
            }
          : day,
      ),
    }))
  }

  const moveItineraryItem = (id: string, direction: 'up' | 'down') => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    setAppData((previous) => ({
      ...previous,
      itineraryDays: previous.itineraryDays.map((day, index) => {
        if (index !== selectedDayIndex) return day

        const indexToMove = day.items.findIndex((item) => item.id === id)
        if (indexToMove < 0) return day

        const nextIndex = direction === 'up' ? indexToMove - 1 : indexToMove + 1
        if (nextIndex < 0 || nextIndex >= day.items.length) return day

        const updatedItems = [...day.items]
        const [movedItem] = updatedItems.splice(indexToMove, 1)
        updatedItems.splice(nextIndex, 0, movedItem)

        return { ...day, items: updatedItems }
      }),
    }))
  }

  const saveShoppingItem = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    if (!shoppingDraft) return

    const normalized = {
      ...shoppingDraft,
      name: shoppingDraft.name.trim(),
      brand: shoppingDraft.brand.trim() || '待填寫',
      preferredStore: shoppingDraft.preferredStore.trim() || '待填寫',
    }

    setAppData((previous) => ({
      ...previous,
      shoppingItems: previous.shoppingItems.some((item) => item.id === normalized.id)
        ? previous.shoppingItems.map((item) =>
            item.id === normalized.id ? normalized : item,
          )
        : [normalized, ...previous.shoppingItems],
    }))
    setShoppingDraft(null)
  }

  const saveRestaurant = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    if (!restaurantDraft) return

    const normalized = {
      ...restaurantDraft,
      name: restaurantDraft.name.trim(),
      address: restaurantDraft.address || '待填寫',
      notes: restaurantDraft.notes || '資料待確認',
    }

    setAppData((previous) => ({
      ...previous,
      restaurants: previous.restaurants.some((item) => item.id === normalized.id)
        ? previous.restaurants.map((item) =>
            item.id === normalized.id ? normalized : item,
          )
        : [normalized, ...previous.restaurants],
    }))
    setRestaurantDraft(null)
  }

  const saveTravelInfo = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    if (!travelInfoDraft) return

    const normalized = {
      ...travelInfoDraft,
      title: travelInfoDraft.title.trim() || '新項目',
      content: travelInfoDraft.content.trim() || '待填寫',
    }

    setAppData((previous) => ({
      ...previous,
      travelInfo: previous.travelInfo.some((item) => item.id === normalized.id)
        ? previous.travelInfo.map((item) =>
            item.id === normalized.id ? normalized : item,
          )
        : [normalized, ...previous.travelInfo],
    }))
    setTravelInfoDraft(null)
  }

  const saveNote = () => {
    if (!canEdit) {
      setShowOwnerGate(true)
      return
    }

    if (!noteDraft) return

    const normalized = {
      ...noteDraft,
      title: noteDraft.title.trim() || '未命名備忘',
      content: noteDraft.content.trim() || '待補充',
    }

    setAppData((previous) => ({
      ...previous,
      notes: previous.notes.some((item) => item.id === normalized.id)
        ? previous.notes.map((item) =>
            item.id === normalized.id ? normalized : item,
          )
        : [normalized, ...previous.notes],
    }))
    setNoteDraft(null)
  }

  if (isSupabaseConfigured && isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf4f8] text-[#3e586d]">
        <div className="flex items-center gap-3 rounded-[24px] bg-[#fbfdff] px-5 py-4 shadow-sm ring-1 ring-[#c7dce8]">
          <Loader2 size={20} className="animate-spin text-[#176fa5]" />
          <span className="text-sm font-medium">正在確認登入狀態</span>
        </div>
      </div>
    )
  }

  if (isSupabaseConfigured && isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf4f8] text-[#3e586d]">
        <div className="flex items-center gap-3 rounded-[24px] bg-[#fbfdff] px-5 py-4 shadow-sm ring-1 ring-[#c7dce8]">
          <Loader2 size={20} className="animate-spin text-[#176fa5]" />
          <span className="text-sm font-medium">正在載入旅遊資料</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen bg-[#eaf4f8] text-slate-800">
      <div className="mx-auto flex max-w-7xl gap-4 p-3 sm:p-5">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-[#c7dce8] bg-[#fbfdff] p-5 shadow-[0_18px_45px_rgba(28,74,105,0.10)] lg:flex lg:flex-col">
          <div
            className="mb-8 flex items-center gap-3"
            onDoubleClick={() => {
              if (!isSupabaseConfigured) setShowOwnerGate(true)
            }}
            title={isSupabaseConfigured ? '登入帳號' : '管理者入口'}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#176fa5] text-lg font-bold text-white">
              T
            </div>
            <div>
              <div className="text-lg font-semibold text-[#173b59]">{appData.trip.tripName}</div>
              <div className="text-xs text-[#587286]">{appData.trip.subtitle}</div>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivePage(key)}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  activePage === key
                    ? 'bg-[#e4f1f8] text-[#15577f] shadow-sm'
                    : 'text-[#3e586d] hover:bg-[#edf5f8]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {label}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </nav>

          <div className="mt-4 space-y-2">
            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#b7d6e5] bg-[#fff1df] px-4 py-3 text-sm font-medium text-[#b96624]"
              >
                <Sparkles size={16} />
                安裝到主畫面
              </button>
            )}
          </div>

        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          {isSupabaseConfigured && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#c7dce8] bg-[#fbfdff] px-4 py-3 text-sm text-[#3e586d] shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Database size={17} className="shrink-0 text-[#176fa5]" />
                <span className="truncate">{syncMessage}</span>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[#edf5f8] px-3 py-1 text-xs font-medium text-[#5b7182]">
                <ShieldCheck size={14} />
                {canEdit ? '管理者可編輯' : '觀看者唯讀'}
              </div>
            </div>
          )}

          {activePage === 'home' && (
            <div className="space-y-4">
              <section className="rounded-[30px] bg-[linear-gradient(120deg,#fff0f5_0%,#ffe0df_48%,#ffd59a_100%)] p-5 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-full bg-[#eaf5fb] px-3 py-1 text-xs font-medium text-[#e78331]">
                    <Sparkles size={14} className="mr-1" />
                    {appData.trip.tripName}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTripDraft(appData.trip)
                          setIsTripEditorOpen(true)
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-[#c7dce8] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#28475d]"
                      >
                        <Sparkles size={14} />
                        直接修改
                      </button>
                      <button
                        type="button"
                        onClick={restoreSampleData}
                        className="inline-flex items-center gap-2 rounded-full border border-[#c7dce8] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#28475d]"
                      >
                        <RefreshCcw size={14} />
                        還原範例資料
                      </button>
                      <button
                        type="button"
                        onClick={isSupabaseConfigured ? handleSignOut : exitOwnerAccess}
                        className="inline-flex items-center gap-2 rounded-full border border-[#c7dce8] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#28475d]"
                      >
                        {isSupabaseConfigured ? <LogOut size={14} /> : <RefreshCcw size={14} />}
                        {isSupabaseConfigured ? '登出' : '退出管理者'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#173b59] sm:text-4xl">
                      {appData.trip.tripName}
                    </h1>
                    <p className="mt-1 text-sm text-[#60798b]">{appData.trip.subtitle}</p>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: '旅行日期', value: appData.trip.travelDates },
                        { label: '旅行天數', value: `${appData.trip.durationDays} 天` },
                        { label: '旅伴人數', value: `${appData.trip.travelers} 人` },
                        { label: '今日日期', value: todayLabel },
                      ].map((info) => (
                        <div key={info.label} className="rounded-2xl bg-white/70 p-3 shadow-sm ring-1 ring-[#dceaf1]">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8798]">{info.label}</div>
                          <div className="mt-2 text-sm font-semibold text-[#173b59]">{info.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#fbfdff] p-4 shadow-sm ring-1 ring-[#dceaf1]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#668093]">入住資訊</div>
                      <Hotel size={18} className="text-[#176fa5]" />
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-[#284b63]">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8798]">飯店</div>
                        <div className="mt-1 font-semibold text-[#173b59]">{appData.trip.hotelName}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#6f8798]">地址</div>
                        <div className="mt-1">{appData.trip.hotelAddress}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_16px_30px_rgba(28,74,105,0.08)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#173b59]">
                      <CalendarDays size={18} className="text-[#176fa5]" />
                      <span className="font-semibold">今日行程摘要</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePage('itinerary')}
                      className="rounded-full bg-[#eaf5fb] px-3 py-1.5 text-xs font-medium text-[#15577f]"
                    >
                      查看行程
                    </button>
                  </div>

                  {selectedDay ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-[#eaf3f8] p-3">
                        <div className="text-[11px] uppercase tracking-[0.1em] text-[#668093]">當前旅遊日</div>
                        <div className="mt-1 text-lg font-semibold text-[#173b59]">{selectedDay.label}</div>
                      </div>
                        {selectedDay.items.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#dceaf1] bg-white p-3">
                            <div>
                              <div className="text-sm font-semibold text-[#173b59]">{item.title}</div>
                              <div className="mt-1 text-xs text-[#60798b]">{item.startTime} · {item.category}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleItineraryComplete(item.id)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                item.completed
                                  ? 'border-[#cfe8d3] bg-[#effaf1] text-[#3d8d57]'
                                  : 'border-[#c8dfec] bg-[#f4f9fc] text-[#9aa0a6]'
                              }`}
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[28px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_16px_30px_rgba(28,74,105,0.08)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#173b59]">
                      <Clock3 size={18} className="text-[#176fa5]" />
                      <span className="font-semibold">下一個行程</span>
                    </div>
                  </div>

                  {nextItem ? (
                    <div className="rounded-2xl bg-[#f4f9fc] p-4 ring-1 ring-[#dceaf1]">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#6f8798]">{nextItem.category}</div>
                      <h3 className="mt-2 text-lg font-semibold text-[#173b59]">{nextItem.title}</h3>
                      <div className="mt-2 text-sm text-[#3e586d]">{nextItem.startTime} · {nextItem.address}</div>
                      <a
                        href={nextItem.link || googleMapsLink(nextItem.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-xs font-medium text-white"
                      >
                        Google Maps
                        <ChevronRight size={14} />
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-[#60798b]">目前尚未安排行程。</p>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_16px_30px_rgba(28,74,105,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#173b59]">
                    <Star size={18} className="text-[#176fa5]" />
                    <span className="font-semibold">常用功能入口</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['行程管理', 'itinerary'],
                    ['旅遊資訊', 'info'],
                    ['旅行備忘', 'notes'],
                    ['管理者設定', 'settings'],
                  ].map(([label, key]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActivePage(key as PageKey)}
                      className="rounded-2xl border border-[#dceaf1] bg-[#eef6f9] px-4 py-3 text-left text-sm font-medium text-[#173b59] transition hover:bg-[#eaf5fb]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'itinerary' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">每日行程</div>
                    <h2 className="text-2xl font-semibold text-[#173b59]">Itinerary</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setItineraryDraft({
                          ...emptyItineraryItem(),
                          id: createId(),
                        })
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增行程
                    </button>
                  )}
                </div>

                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  {appData.itineraryDays.map((day, index) => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDayIndex(index)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                        selectedDayIndex === index
                          ? 'bg-[#176fa5] text-white'
                          : 'bg-[#edf5f8] text-[#3e586d]'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {selectedDay.items.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-[24px] border p-3 shadow-sm transition ${
                        expandedItemId === item.id
                          ? 'border-[#c8dfec] bg-[#f4f9fc]'
                          : 'border-[#dceaf1] bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                          className="flex flex-1 items-start gap-3 text-left"
                        >
                          {canEdit && (
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleItineraryComplete(item.id)}
                              className="mt-1 h-4 w-4 accent-[#176fa5]"
                              aria-label={`標記${item.title}已完成`}
                            />
                          )}
                          <div>
                            <div className="text-sm font-semibold text-[#173b59]">{item.title}</div>
                            <div className="mt-1 text-xs text-[#60798b]">
                              {item.startTime} · {item.category} · {item.duration}
                            </div>
                          </div>
                        </button>

                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => moveItineraryItem(item.id, 'up')} className="rounded-full border border-[#c7dce8] p-2 text-[#3e586d]" aria-label="上移"><ArrowUp size={14} /></button>
                            <button type="button" onClick={() => moveItineraryItem(item.id, 'down')} className="rounded-full border border-[#c7dce8] p-2 text-[#3e586d]" aria-label="下移"><ArrowDown size={14} /></button>
                            <button
                              type="button"
                              onClick={() => {
                                setItineraryDraft(item)
                                setExpandedItemId(item.id)
                              }}
                              className="rounded-full bg-[#eaf5fb] p-2 text-[#15577f]"
                              aria-label="編輯行程"
                            >
                              <Sparkles size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItineraryItem(item.id)}
                              className="rounded-full bg-[#eaf5fb] p-2 text-[#15577f]"
                              aria-label="刪除行程"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {expandedItemId === item.id && (
                        <div className="mt-3 rounded-2xl bg-[#eef5f8] p-3 text-sm text-[#3e586d]">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div><span className="font-medium text-[#284b63]">地址：</span>{item.address}</div>
                            <div><span className="font-medium text-[#284b63]">交通：</span>{item.transport}</div>
                            <div><span className="font-medium text-[#284b63]">備註：</span>{item.notes}</div>
                            <div><span className="font-medium text-[#284b63]">導航：</span><a href={item.link || googleMapsLink(item.address)} target="_blank" rel="noreferrer" className="text-[#15577f] underline">Google Maps</a></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'info' && (
            <div className="mb-4 flex flex-wrap gap-2 rounded-[24px] border border-[#c7dce8] bg-[#fbfdff] p-2 shadow-sm">
              {(['旅遊資訊', '美食', '購物'] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setInfoCategory(category)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    infoCategory === category
                      ? 'bg-[#176fa5] text-white'
                      : 'bg-[#edf5f8] text-[#3e586d] hover:bg-[#e5f3f9]'
                  }`}
                >
                  {category}
                  {category === '美食' && ` (${appData.restaurants.length})`}
                  {category === '購物' && ` (${appData.shoppingItems.length})`}
                </button>
              ))}
            </div>
          )}

          {activePage === 'info' && infoCategory === '購物' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">購物目標</div>
                    <h2 className="text-2xl font-semibold text-[#173b59]">Shopping</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShoppingDraft({ ...emptyShoppingItem(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增項目
                    </button>
                  )}
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {['全部', '待購買', '已購買'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setShoppingStatusFilter(status as '全部' | '待購買' | '已購買')}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        shoppingStatusFilter === status
                          ? 'bg-[#176fa5] text-white'
                          : 'bg-[#edf5f8] text-[#3e586d]'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                  <select
                    value={shoppingRegionFilter}
                    onChange={(event) => setShoppingRegionFilter(event.target.value)}
                    className="rounded-full border border-[#cbdfe9] bg-[#f4f9fc] px-3 py-1.5 text-sm text-[#284b63] outline-none"
                  >
                    <option value="全部">全部區域</option>
                    {Array.from(new Set(appData.shoppingItems.map((item) => item.area))).map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {appData.shoppingItems
                    .filter((item) =>
                      (shoppingStatusFilter === '全部' || item.status === shoppingStatusFilter) &&
                      (shoppingRegionFilter === '全部' || item.area === shoppingRegionFilter),
                    )
                    .map((item) => (
                      <div key={item.id} className="rounded-[24px] border border-[#dceaf1] bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-[#173b59]">{item.name}</div>
                            <div className="mt-1 text-xs text-[#60798b]">{item.brand} · {item.area}</div>
                          </div>
                          <div className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                            item.status === '已購買'
                              ? 'bg-[#eaf7ee] text-[#3a8f5d]'
                              : 'bg-[#e8f4fa] text-[#15577f]'
                          }`}>
                            {item.status}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-[#284b63] sm:grid-cols-2">
                          <div>預算：{formatYen(item.budget)}</div>
                          <div>實際：{formatYen(item.actualPrice)}</div>
                          <div>店家：{item.preferredStore}</div>
                          <div>備註：{item.notes || '待補充'}</div>
                        </div>
                        {canEdit && (
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => setShoppingDraft(item)} className="rounded-full bg-[#eaf5fb] px-3 py-1.5 text-xs font-medium text-[#15577f]">編輯</button>
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, shoppingItems: previous.shoppingItems.filter((entry) => entry.id !== item.id) }))} className="rounded-full border border-[#c8dfec] px-3 py-1.5 text-xs font-medium text-[#3e586d]">刪除</button>
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, shoppingItems: previous.shoppingItems.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === '已購買' ? '待購買' : '已購買' } : entry) }))} className="rounded-full bg-[#f2f8f3] px-3 py-1.5 text-xs font-medium text-[#3d8d57]">{item.status === '已購買' ? '改為未購買' : '已購買'}</button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'info' && infoCategory === '美食' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">餐廳列表</div>
                    <h2 className="text-2xl font-semibold text-[#173b59]">Food</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setRestaurantDraft({ ...emptyRestaurant(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增餐廳
                    </button>
                  )}
                </div>

                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-[#587286]" size={16} />
                    <input
                      type="text"
                      value={restaurantSearch}
                      onChange={(event) => setRestaurantSearch(event.target.value)}
                      placeholder="搜尋餐廳或區域"
                      className="h-11 w-full rounded-full border border-[#cbdfe9] bg-[#f4f9fc] pl-10 pr-3 text-sm text-[#173b59] outline-none"
                    />
                  </div>
                  <select
                    value={restaurantFilter}
                    onChange={(event) => setRestaurantFilter(event.target.value)}
                    className="h-11 rounded-full border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm text-[#284b63] outline-none"
                  >
                    <option value="全部">全部類型</option>
                    {Array.from(new Set(appData.restaurants.map((item) => item.type))).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {filteredRestaurants.map((restaurant) => (
                    <div key={restaurant.id} className="rounded-[24px] border border-[#dceaf1] bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[#173b59]">{restaurant.name}</div>
                          <div className="mt-1 text-xs text-[#60798b]">{restaurant.type} · {restaurant.area}</div>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setRestaurantDraft(restaurant)}
                            className="rounded-full bg-[#eaf5fb] px-2 py-1 text-[10px] font-medium text-[#15577f]"
                          >
                            編輯
                          </button>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-[#284b63] sm:grid-cols-2">
                        <div>地址：{restaurant.address}</div>
                        <div>預算：{restaurant.budget}</div>
                        <div>營業時間：{restaurant.hours}</div>
                        <div>需要預約：{restaurant.reservation}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-[#3e586d]">{restaurant.notes}</div>
                        <div className="flex gap-2">
                          {canEdit && (
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, restaurants: previous.restaurants.map((entry) => entry.id === restaurant.id ? { ...entry, favorite: !entry.favorite } : entry) }))} className={`rounded-full px-2 py-1 text-[10px] font-medium ${restaurant.favorite ? 'bg-[#fff0d8] text-[#a6712a]' : 'bg-[#edf5f8] text-[#3e586d]'}`}>
                              {restaurant.favorite ? '已收藏' : '收藏'}
                            </button>
                          )}
                          <a href={restaurant.link || googleMapsLink(restaurant.address)} target="_blank" rel="noreferrer" className="rounded-full bg-[#176fa5] px-3 py-1.5 text-xs font-medium text-white">Google Maps</a>
                          {canEdit && (
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, restaurants: previous.restaurants.filter((entry) => entry.id !== restaurant.id) }))} className="rounded-full border border-[#c7dce8] px-3 py-1.5 text-xs font-medium text-[#3e586d]">刪除</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'info' && infoCategory === '旅遊資訊' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">旅遊資訊中心</div>
                    <h2 className="text-2xl font-semibold text-[#173b59]">Travel Info</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setTravelInfoDraft({ ...emptyInfoItem(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增資訊
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {appData.travelInfo.map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-[#dceaf1] bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-base font-semibold text-[#173b59]">{item.title}</div>
                        <span className="rounded-full bg-[#e8f4fa] px-2 py-1 text-[10px] font-medium text-[#15577f]">{item.badge}</span>
                      </div>
                      <p className="mt-3 text-sm text-[#3e586d]">{item.content}</p>
                      {canEdit && (
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => setTravelInfoDraft(item)} className="rounded-full bg-[#eaf5fb] px-3 py-1.5 text-xs font-medium text-[#15577f]">編輯</button>
                          <button type="button" onClick={() => setAppData((previous) => ({ ...previous, travelInfo: previous.travelInfo.filter((entry) => entry.id !== item.id) }))} className="rounded-full border border-[#c7dce8] px-3 py-1.5 text-xs font-medium text-[#3e586d]">刪除</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'settings' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-5 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-6">
                <div className="mb-5">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">帳號與權限</div>
                  <h2 className="text-2xl font-semibold text-[#173b59]">設定</h2>
                </div>

                {isSupabaseConfigured && session ? (
                  <div className="flex flex-col gap-4 rounded-[24px] border border-[#dceaf1] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-[#173b59]">
                        <ShieldCheck size={18} className="text-[#3d8d57]" />
                        {canEdit ? '管理者已登入' : '目前帳號沒有管理權限'}
                      </div>
                      <p className="mt-1 text-sm text-[#60798b]">{session.user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#c7dce8] px-4 py-2.5 text-sm font-medium text-[#28475d]"
                    >
                      <LogOut size={16} />
                      登出
                    </button>
                  </div>
                ) : isSupabaseConfigured ? (
                  <div className="rounded-[24px] border border-[#dceaf1] bg-white p-4">
                    <p className="mb-4 text-sm leading-6 text-[#60798b]">
                      訪客可以直接查看行程；只有管理者需要登入以編輯共享資料。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowOwnerGate(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#176fa5] px-5 py-3 text-sm font-semibold text-white shadow-sm"
                    >
                      <ShieldCheck size={17} />
                      管理者登入
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-[#dceaf1] bg-white p-4">
                    <p className="mb-4 text-sm leading-6 text-[#60798b]">
                      {canEdit ? '目前使用本機管理者模式。' : '訪客可以查看行程；管理者模式可編輯本機資料。'}
                    </p>
                    <button
                      type="button"
                      onClick={canEdit ? exitOwnerAccess : () => setShowOwnerGate(true)}
                      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${
                        canEdit
                          ? 'border border-[#c7dce8] text-[#28475d]'
                          : 'bg-[#176fa5] text-white shadow-sm'
                      }`}
                    >
                      <ShieldCheck size={17} />
                      {canEdit ? '退出管理者' : '管理者登入'}
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {activePage === 'notes' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#c7dce8] bg-[#fbfdff] p-4 shadow-[0_18px_35px_rgba(28,74,105,0.10)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#658093]">旅行備忘</div>
                    <h2 className="text-2xl font-semibold text-[#173b59]">Notes</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setNoteDraft({ ...emptyNote(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#176fa5] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增備忘
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {appData.notes.map((note) => (
                    <div key={note.id} className="rounded-[24px] border border-[#dceaf1] bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-base font-semibold text-[#173b59]">{note.title}</div>
                        {canEdit && (
                          <button type="button" onClick={() => setNoteDraft(note)} className="rounded-full bg-[#eaf5fb] px-2.5 py-1.5 text-xs font-medium text-[#15577f]">編輯</button>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-[#6f8798]">{note.createdAt}</div>
                      <p className="mt-3 text-sm leading-7 text-[#3e586d]">{note.content}</p>
                      {canEdit && (
                        <div className="mt-3 flex justify-end">
                          <button type="button" onClick={() => setAppData((previous) => ({ ...previous, notes: previous.notes.filter((entry) => entry.id !== note.id) }))} className="rounded-full border border-[#c7dce8] px-3 py-1.5 text-xs font-medium text-[#3e586d]">刪除</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'home' && canEdit && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={exportData} className="rounded-full bg-[#eaf5fb] px-4 py-2 text-sm font-medium text-[#15577f]">匯出 JSON</button>
              <label className="rounded-full bg-[#eaf4f8] px-4 py-2 text-sm font-medium text-[#2d6a4d] cursor-pointer">
                匯入 JSON
                <input type="file" accept="application/json" className="hidden" onChange={importData} />
              </label>
            </div>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#c7dce8] bg-[#fbfdff]/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
          {navItems.slice(0, 5).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePage(key)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] ${
                activePage === key ? 'bg-[#dceef8] text-[#15577f]' : 'text-[#3e586d]'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {showOwnerGate && isSupabaseConfigured && !session && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <LoginPage onCancel={() => setShowOwnerGate(false)} />
        </div>
      )}

      {showOwnerGate && !isSupabaseConfigured && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">管理者模式</div>
              <button type="button" onClick={() => setShowOwnerGate(false)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <p className="mb-3 text-sm text-[#3e586d]">這個頁面已切換成訪客模式，輸入管理者編碼後即可解鎖編輯權限。</p>
            <input
              type="password"
              value={ownerCodeInput}
              onChange={(event) => setOwnerCodeInput(event.target.value)}
              placeholder="請輸入管理者編碼"
              className="h-11 w-full rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowOwnerGate(false)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={unlockOwnerAccess} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">解鎖編輯</button>
            </div>
          </div>
        </div>
      )}

      {isTripEditorOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">旅遊資訊編輯</div>
              <button type="button" onClick={() => setIsTripEditorOpen(false)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={tripDraft.tripName} onChange={(event) => setTripDraft({ ...tripDraft, tripName: event.target.value })} placeholder="旅行名稱" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.subtitle} onChange={(event) => setTripDraft({ ...tripDraft, subtitle: event.target.value })} placeholder="副標題" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.travelDates} onChange={(event) => setTripDraft({ ...tripDraft, travelDates: event.target.value })} placeholder="旅行日期" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input type="number" value={tripDraft.durationDays} onChange={(event) => setTripDraft({ ...tripDraft, durationDays: Number(event.target.value) || 1 })} placeholder="天數" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input type="number" value={tripDraft.travelers} onChange={(event) => setTripDraft({ ...tripDraft, travelers: Number(event.target.value) || 1 })} placeholder="旅伴人數" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={tripDraft.hotelName} onChange={(event) => setTripDraft({ ...tripDraft, hotelName: event.target.value })} placeholder="飯店名稱" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.hotelAddress} onChange={(event) => setTripDraft({ ...tripDraft, hotelAddress: event.target.value })} placeholder="飯店地址" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIsTripEditorOpen(false)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={saveTripInfo} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {itineraryDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">{itineraryDraft.id ? '編輯行程' : '新增行程'}</div>
              <button type="button" onClick={() => setItineraryDraft(null)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={itineraryDraft.title} onChange={(event) => setItineraryDraft({ ...itineraryDraft, title: event.target.value })} placeholder="行程名稱" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={itineraryDraft.startTime} onChange={(event) => setItineraryDraft({ ...itineraryDraft, startTime: event.target.value })} placeholder="開始時間" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={itineraryDraft.duration} onChange={(event) => setItineraryDraft({ ...itineraryDraft, duration: event.target.value })} placeholder="停留時間" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={itineraryDraft.category} onChange={(event) => setItineraryDraft({ ...itineraryDraft, category: event.target.value })} placeholder="分類" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={itineraryDraft.transport} onChange={(event) => setItineraryDraft({ ...itineraryDraft, transport: event.target.value })} placeholder="交通方式" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={itineraryDraft.address} onChange={(event) => setItineraryDraft({ ...itineraryDraft, address: event.target.value })} placeholder="地址" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <textarea value={itineraryDraft.notes} onChange={(event) => setItineraryDraft({ ...itineraryDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setItineraryDraft(null)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={updateItineraryItem} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {shoppingDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">{shoppingDraft.id ? '編輯購物項目' : '新增購物項目'}</div>
              <button type="button" onClick={() => setShoppingDraft(null)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={shoppingDraft.name} onChange={(event) => setShoppingDraft({ ...shoppingDraft, name: event.target.value })} placeholder="商品名稱" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={shoppingDraft.brand} onChange={(event) => setShoppingDraft({ ...shoppingDraft, brand: event.target.value })} placeholder="品牌或店家" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={shoppingDraft.area} onChange={(event) => setShoppingDraft({ ...shoppingDraft, area: event.target.value })} placeholder="區域" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={shoppingDraft.preferredStore} onChange={(event) => setShoppingDraft({ ...shoppingDraft, preferredStore: event.target.value })} placeholder="預計購買店家" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input type="number" value={shoppingDraft.budget} onChange={(event) => setShoppingDraft({ ...shoppingDraft, budget: Number(event.target.value) })} placeholder="預算" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input type="number" value={shoppingDraft.actualPrice} onChange={(event) => setShoppingDraft({ ...shoppingDraft, actualPrice: Number(event.target.value) })} placeholder="實際價格" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <textarea value={shoppingDraft.notes} onChange={(event) => setShoppingDraft({ ...shoppingDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShoppingDraft(null)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={saveShoppingItem} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {restaurantDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">{restaurantDraft.id ? '編輯餐廳' : '新增餐廳'}</div>
              <button type="button" onClick={() => setRestaurantDraft(null)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={restaurantDraft.name} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, name: event.target.value })} placeholder="餐廳名稱" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={restaurantDraft.type} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, type: event.target.value })} placeholder="餐點類型" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={restaurantDraft.area} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, area: event.target.value })} placeholder="區域" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={restaurantDraft.address} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, address: event.target.value })} placeholder="地址" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none sm:col-span-2" />
              <input value={restaurantDraft.budget} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, budget: event.target.value })} placeholder="預算範圍" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={restaurantDraft.hours} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, hours: event.target.value })} placeholder="營業時間" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <textarea value={restaurantDraft.notes} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRestaurantDraft(null)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={saveRestaurant} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {travelInfoDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">{travelInfoDraft.id ? '編輯資訊' : '新增資訊'}</div>
              <button type="button" onClick={() => setTravelInfoDraft(null)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3">
              <input value={travelInfoDraft.title} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, title: event.target.value })} placeholder="標題" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <input value={travelInfoDraft.badge} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, badge: event.target.value })} placeholder="狀態標籤" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <textarea value={travelInfoDraft.content} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, content: event.target.value })} placeholder="內容" className="min-h-28 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] p-3 text-sm outline-none" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTravelInfoDraft(null)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={saveTravelInfo} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {noteDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#173b59]">{noteDraft.id ? '編輯備忘' : '新增備忘'}</div>
              <button type="button" onClick={() => setNoteDraft(null)} className="rounded-full bg-[#f0f6f9] p-2 text-[#3e586d]"><X size={16} /></button>
            </div>
            <div className="grid gap-3">
              <input value={noteDraft.title} onChange={(event) => setNoteDraft({ ...noteDraft, title: event.target.value })} placeholder="標題" className="h-11 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] px-3 text-sm outline-none" />
              <textarea value={noteDraft.content} onChange={(event) => setNoteDraft({ ...noteDraft, content: event.target.value })} placeholder="內容" className="min-h-28 rounded-xl border border-[#cbdfe9] bg-[#f4f9fc] p-3 text-sm outline-none" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteDraft(null)} className="rounded-full border border-[#c7dce8] px-4 py-2 text-sm font-medium text-[#3e586d]">取消</button>
              <button type="button" onClick={saveNote} className="rounded-full bg-[#176fa5] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
