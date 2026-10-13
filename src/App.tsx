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
  MapPinned,
  NotebookPen,
  Plane,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type {
  ItineraryItem,
  NoteItem,
  PageKey,
  PlaceCategory,
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
  { key: 'map', label: '地圖', icon: MapPinned },
  { key: 'shopping', label: '購物', icon: ShoppingBag },
  { key: 'food', label: '美食', icon: UtensilsCrossed },
  { key: 'info', label: '資訊', icon: Plane },
  { key: 'notes', label: '備忘', icon: NotebookPen },
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
  const [mapFilter, setMapFilter] = useState<'全部' | PlaceCategory>('全部')
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

  const filteredPlaces = useMemo(() => {
    const next =
      mapFilter === '全部'
        ? appData.places
        : appData.places.filter((place) => place.category === mapFilter)

    return next
  }, [appData.places, mapFilter])

  const shoppingSummaries = useMemo(() => {
    const budget = appData.shoppingItems.reduce((sum, item) => sum + item.budget, 0)
    const spent = appData.shoppingItems.reduce((sum, item) => sum + item.actualPrice, 0)
    const remaining = appData.shoppingItems.filter((item) => item.status !== '已購買').length

    return { budget, spent, remaining }
  }, [appData.shoppingItems])

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
      <div className="flex min-h-screen items-center justify-center bg-[#f5f0ea] text-[#4b5563]">
        <div className="flex items-center gap-3 rounded-[24px] bg-[#fffdfa] px-5 py-4 shadow-sm ring-1 ring-[#eadfd8]">
          <Loader2 size={20} className="animate-spin text-[#d74d4d]" />
          <span className="text-sm font-medium">正在確認登入狀態</span>
        </div>
      </div>
    )
  }

  if (isSupabaseConfigured && isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f0ea] text-[#4b5563]">
        <div className="flex items-center gap-3 rounded-[24px] bg-[#fffdfa] px-5 py-4 shadow-sm ring-1 ring-[#eadfd8]">
          <Loader2 size={20} className="animate-spin text-[#d74d4d]" />
          <span className="text-sm font-medium">正在載入旅遊資料</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen bg-[#f5f0ea] text-slate-800">
      <div className="mx-auto flex max-w-7xl gap-4 p-3 sm:p-5">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-[#eadfd8] bg-[#fffdfa] p-5 shadow-[0_18px_45px_rgba(90,67,53,0.08)] lg:flex lg:flex-col">
          <div
            className="mb-8 flex items-center gap-3"
            onDoubleClick={() => {
              if (!isSupabaseConfigured) setShowOwnerGate(true)
            }}
            title={isSupabaseConfigured ? '登入帳號' : '管理者入口'}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d74d4d] text-lg font-bold text-white">
              T
            </div>
            <div>
              <div className="text-lg font-semibold text-[#1f2937]">{appData.trip.tripName}</div>
              <div className="text-xs text-[#7a6a62]">{appData.trip.subtitle}</div>
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
                    ? 'bg-[#fdf0ee] text-[#b23b3b] shadow-sm'
                    : 'text-[#4b5563] hover:bg-[#f8f3ee]'
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
            {isSupabaseConfigured && session ? (
              <>
                <div className="rounded-2xl border border-[#ead7d0] bg-[#fff8f6] px-4 py-3 text-sm text-[#524743]">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck size={16} />
                    {canEdit ? '管理者帳號' : '觀看者帳號'}
                  </div>
                  <div className="mt-1 truncate text-xs text-[#7a6a62]">
                    {session?.user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ead7d0] bg-white px-4 py-3 text-sm font-medium text-[#524743]"
                >
                  <LogOut size={16} />
                  登出
                </button>
              </>
            ) : isSupabaseConfigured ? (
              <button
                type="button"
                onClick={() => setShowOwnerGate(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d74d4d] px-4 py-3 text-sm font-medium text-white shadow-sm"
              >
                <ShieldCheck size={16} />
                管理者登入
              </button>
            ) : canEdit ? (
              <button
                type="button"
                onClick={exitOwnerAccess}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ead7d0] bg-[#fff8f6] px-4 py-3 text-sm font-medium text-[#524743]"
              >
                <ShieldCheck size={16} />
                退出管理者
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowOwnerGate(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d74d4d] px-4 py-3 text-sm font-medium text-white shadow-sm"
              >
                <ShieldCheck size={16} />
                管理者模式
              </button>
            )}

            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#d9b8a2] bg-[#fff8f2] px-4 py-3 text-sm font-medium text-[#a15d40]"
              >
                <Sparkles size={16} />
                安裝到主畫面
              </button>
            )}
          </div>

          <div className="mt-auto rounded-[22px] bg-[#faf3ef] p-4 text-sm text-[#4b5563]">
            <div className="mb-2 flex items-center gap-2 text-[#b23b3b]">
              <Sparkles size={16} />
              <span className="font-semibold">旅遊概覽</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>行程天數</span>
                <span>{appData.trip.durationDays} 天</span>
              </div>
              <div className="flex items-center justify-between">
                <span>旅伴</span>
                <span>{appData.trip.travelers} 人</span>
              </div>
              <div className="flex items-center justify-between">
                <span>飯店</span>
                <span className="max-w-[120px] truncate">{appData.trip.hotelName}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 pb-24 lg:pb-0">
          {isSupabaseConfigured && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#eadfd8] bg-[#fffdfa] px-4 py-3 text-sm text-[#4b5563] shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Database size={17} className="shrink-0 text-[#d74d4d]" />
                <span className="truncate">{syncMessage}</span>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[#f7f2ee] px-3 py-1 text-xs font-medium text-[#6b5d56]">
                <ShieldCheck size={14} />
                {canEdit ? '管理者可編輯' : '觀看者唯讀'}
              </div>
            </div>
          )}

          {activePage === 'home' && (
            <div className="space-y-4">
              <section className="rounded-[30px] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(245,220,216,0.8))] p-5 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-full bg-[#fff0ef] px-3 py-1 text-xs font-medium text-[#be4a41]">
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
                        className="inline-flex items-center gap-2 rounded-full border border-[#ead7d0] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#524743]"
                      >
                        <Sparkles size={14} />
                        直接修改
                      </button>
                      <button
                        type="button"
                        onClick={restoreSampleData}
                        className="inline-flex items-center gap-2 rounded-full border border-[#ead7d0] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#524743]"
                      >
                        <RefreshCcw size={14} />
                        還原範例資料
                      </button>
                      <button
                        type="button"
                        onClick={isSupabaseConfigured ? handleSignOut : exitOwnerAccess}
                        className="inline-flex items-center gap-2 rounded-full border border-[#ead7d0] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#524743]"
                      >
                        {isSupabaseConfigured ? <LogOut size={14} /> : <RefreshCcw size={14} />}
                        {isSupabaseConfigured ? '登出' : '退出管理者'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-[#1f2937] sm:text-4xl">
                      {appData.trip.tripName}
                    </h1>
                    <p className="mt-1 text-sm text-[#6b7280]">{appData.trip.subtitle}</p>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: '旅行日期', value: appData.trip.travelDates },
                        { label: '旅行天數', value: `${appData.trip.durationDays} 天` },
                        { label: '旅伴人數', value: `${appData.trip.travelers} 人` },
                        { label: '今日日期', value: todayLabel },
                      ].map((info) => (
                        <div key={info.label} className="rounded-2xl bg-white/70 p-3 shadow-sm ring-1 ring-[#f1e6df]">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">{info.label}</div>
                          <div className="mt-2 text-sm font-semibold text-[#1f2937]">{info.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#fffefc] p-4 shadow-sm ring-1 ring-[#f0e7e2]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#886d64]">入住資訊</div>
                      <Hotel size={18} className="text-[#d74d4d]" />
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-[#374151]">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">飯店</div>
                        <div className="mt-1 font-semibold text-[#1f2937]">{appData.trip.hotelName}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">地址</div>
                        <div className="mt-1">{appData.trip.hotelAddress}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_16px_30px_rgba(83,62,52,0.06)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#1f2937]">
                      <CalendarDays size={18} className="text-[#d74d4d]" />
                      <span className="font-semibold">今日行程摘要</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePage('itinerary')}
                      className="rounded-full bg-[#fff3f1] px-3 py-1.5 text-xs font-medium text-[#b23b3b]"
                    >
                      查看行程
                    </button>
                  </div>

                  {selectedDay ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-[#f8f2ee] p-3">
                        <div className="text-[11px] uppercase tracking-[0.1em] text-[#8b7a73]">當前旅遊日</div>
                        <div className="mt-1 text-lg font-semibold text-[#1f2937]">{selectedDay.label}</div>
                      </div>
                        {selectedDay.items.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#f0e4df] bg-white p-3">
                            <div>
                              <div className="text-sm font-semibold text-[#1f2937]">{item.title}</div>
                              <div className="mt-1 text-xs text-[#6b7280]">{item.startTime} · {item.category}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleItineraryComplete(item.id)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                item.completed
                                  ? 'border-[#cfe8d3] bg-[#effaf1] text-[#3d8d57]'
                                  : 'border-[#f0d7d2] bg-[#fffaf7] text-[#9aa0a6]'
                              }`}
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[28px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_16px_30px_rgba(83,62,52,0.06)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#1f2937]">
                      <Clock3 size={18} className="text-[#d74d4d]" />
                      <span className="font-semibold">下一個行程</span>
                    </div>
                  </div>

                  {nextItem ? (
                    <div className="rounded-2xl bg-[#fffaf8] p-4 ring-1 ring-[#f3e0d6]">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#8d7e76]">{nextItem.category}</div>
                      <h3 className="mt-2 text-lg font-semibold text-[#1f2937]">{nextItem.title}</h3>
                      <div className="mt-2 text-sm text-[#4b5563]">{nextItem.startTime} · {nextItem.address}</div>
                      <a
                        href={nextItem.link || googleMapsLink(nextItem.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-xs font-medium text-white"
                      >
                        Google Maps
                        <ChevronRight size={14} />
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-[#6b7280]">目前尚未安排行程。</p>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_16px_30px_rgba(83,62,52,0.06)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#1f2937]">
                    <Star size={18} className="text-[#d74d4d]" />
                    <span className="font-semibold">常用功能入口</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['行程管理', 'itinerary'],
                    ['地點地圖', 'map'],
                    ['購物清單', 'shopping'],
                    ['美食清單', 'food'],
                  ].map(([label, key]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActivePage(key as PageKey)}
                      className="rounded-2xl border border-[#f2e3df] bg-[#faf7f4] px-4 py-3 text-left text-sm font-medium text-[#1f2937] transition hover:bg-[#fff3f0]"
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
              <section className="rounded-[30px] border border-[#efdfd8] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">每日行程</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Itinerary</h2>
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
                      className="inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-sm font-medium text-white"
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
                          ? 'bg-[#d74d4d] text-white'
                          : 'bg-[#f7f1ee] text-[#4b5563]'
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
                          ? 'border-[#f1d7d0] bg-[#fffaf8]'
                          : 'border-[#f1e6df] bg-white'
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
                              className="mt-1 h-4 w-4 accent-[#d74d4d]"
                              aria-label={`標記${item.title}已完成`}
                            />
                          )}
                          <div>
                            <div className="text-sm font-semibold text-[#1f2937]">{item.title}</div>
                            <div className="mt-1 text-xs text-[#6b7280]">
                              {item.startTime} · {item.category} · {item.duration}
                            </div>
                          </div>
                        </button>

                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => moveItineraryItem(item.id, 'up')} className="rounded-full border border-[#eed9d5] p-2 text-[#4b5563]" aria-label="上移"><ArrowUp size={14} /></button>
                            <button type="button" onClick={() => moveItineraryItem(item.id, 'down')} className="rounded-full border border-[#eed9d5] p-2 text-[#4b5563]" aria-label="下移"><ArrowDown size={14} /></button>
                            <button
                              type="button"
                              onClick={() => {
                                setItineraryDraft(item)
                                setExpandedItemId(item.id)
                              }}
                              className="rounded-full bg-[#fff1ee] p-2 text-[#b23b3b]"
                              aria-label="編輯行程"
                            >
                              <Sparkles size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItineraryItem(item.id)}
                              className="rounded-full bg-[#fff1ee] p-2 text-[#b23b3b]"
                              aria-label="刪除行程"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {expandedItemId === item.id && (
                        <div className="mt-3 rounded-2xl bg-[#faf6f3] p-3 text-sm text-[#4b5563]">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div><span className="font-medium text-[#374151]">地址：</span>{item.address}</div>
                            <div><span className="font-medium text-[#374151]">交通：</span>{item.transport}</div>
                            <div><span className="font-medium text-[#374151]">備註：</span>{item.notes}</div>
                            <div><span className="font-medium text-[#374151]">導航：</span><a href={item.link || googleMapsLink(item.address)} target="_blank" rel="noreferrer" className="text-[#b23b3b] underline">Google Maps</a></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'map' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">地點總覽</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Map</h2>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {['全部', '景點', '美食', '購物', '飯店', '其他'].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setMapFilter(category as '全部' | PlaceCategory)}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        mapFilter === category
                          ? 'bg-[#d74d4d] text-white'
                          : 'bg-[#f6f0ee] text-[#4b5563]'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="overflow-hidden rounded-[30px] border border-[#f0dfd7] bg-[radial-gradient(circle_at_25%_20%,_rgba(255,220,194,0.45),_transparent_25%),linear-gradient(135deg,#f7f1ee,#f3f6f9)] p-4">
                  <div className="relative h-52 rounded-[26px] bg-white/60 shadow-inner ring-1 ring-[#f0e5e0]">
                    <div className="absolute left-[12%] top-[18%] h-12 w-12 rounded-full border-4 border-[#d74d4d] bg-white/80" />
                    <div className="absolute right-[18%] top-[20%] h-10 w-10 rounded-full border-4 border-[#6f8bff] bg-white/80" />
                    <div className="absolute left-[44%] top-[42%] h-10 w-10 rounded-full border-4 border-[#77bf93] bg-white/80" />
                    <div className="absolute left-[60%] top-[62%] h-10 w-10 rounded-full border-4 border-[#d98c52] bg-white/80" />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,transparent_40%,rgba(148,163,184,0.12)_40%,rgba(148,163,184,0.12)_41%,transparent_41%),linear-gradient(0deg,transparent_0%,transparent_60%,rgba(148,163,184,0.1)_60%,rgba(148,163,184,0.1)_61%,transparent_61%)]" />
                    <div className="absolute inset-x-4 bottom-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-[#5f6d7a]">
                      <span>東京市</span>
                      <span>示意地圖</span>
                      <span>交通路線</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="space-y-3">
                  {filteredPlaces.map((place) => (
                    <div key={place.id} className="rounded-[24px] border border-[#f0e6df] bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${place.color}`}>{place.category}</div>
                          <div className="mt-2 text-base font-semibold text-[#1f2937]">{place.name}</div>
                          <div className="mt-1 text-xs text-[#6b7280]">{place.area} · {place.address}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePage('itinerary')
                            setSelectedDayIndex(0)
                          }}
                          className="rounded-full bg-[#fff3f1] px-2.5 py-1.5 text-xs font-medium text-[#b23b3b]"
                        >
                          查看行程
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-[#4b5563]">{place.notes}</p>
                      <div className="mt-3 flex gap-2">
                        <a href={place.link} target="_blank" rel="noreferrer" className="rounded-full bg-[#d74d4d] px-3 py-2 text-xs font-medium text-white">開啟 Google Maps</a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'shopping' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">購物目標</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Shopping</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShoppingDraft({ ...emptyShoppingItem(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增項目
                    </button>
                  )}
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#fff5f3] p-3">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">預算總額</div>
                    <div className="mt-2 text-lg font-semibold text-[#1f2937]">{formatYen(shoppingSummaries.budget)}</div>
                  </div>
                  <div className="rounded-2xl bg-[#f1f7f3] p-3">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">實際花費</div>
                    <div className="mt-2 text-lg font-semibold text-[#1f2937]">{formatYen(shoppingSummaries.spent)}</div>
                  </div>
                  <div className="rounded-2xl bg-[#faf6ef] p-3">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-[#8d7e76]">未購買</div>
                    <div className="mt-2 text-lg font-semibold text-[#1f2937]">{shoppingSummaries.remaining} 項</div>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {['全部', '待購買', '已購買'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setShoppingStatusFilter(status as '全部' | '待購買' | '已購買')}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        shoppingStatusFilter === status
                          ? 'bg-[#d74d4d] text-white'
                          : 'bg-[#f7f1ee] text-[#4b5563]'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                  <select
                    value={shoppingRegionFilter}
                    onChange={(event) => setShoppingRegionFilter(event.target.value)}
                    className="rounded-full border border-[#eeded8] bg-[#fffaf8] px-3 py-1.5 text-sm text-[#374151] outline-none"
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
                      <div key={item.id} className="rounded-[24px] border border-[#f0e6df] bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-[#1f2937]">{item.name}</div>
                            <div className="mt-1 text-xs text-[#6b7280]">{item.brand} · {item.area}</div>
                          </div>
                          <div className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                            item.status === '已購買'
                              ? 'bg-[#eaf7ee] text-[#3a8f5d]'
                              : 'bg-[#fff0ee] text-[#b74b4b]'
                          }`}>
                            {item.status}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-[#374151] sm:grid-cols-2">
                          <div>預算：{formatYen(item.budget)}</div>
                          <div>實際：{formatYen(item.actualPrice)}</div>
                          <div>店家：{item.preferredStore}</div>
                          <div>備註：{item.notes || '待補充'}</div>
                        </div>
                        {canEdit && (
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => setShoppingDraft(item)} className="rounded-full bg-[#fff3f1] px-3 py-1.5 text-xs font-medium text-[#b23b3b]">編輯</button>
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, shoppingItems: previous.shoppingItems.filter((entry) => entry.id !== item.id) }))} className="rounded-full border border-[#f0d9d3] px-3 py-1.5 text-xs font-medium text-[#4b5563]">刪除</button>
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, shoppingItems: previous.shoppingItems.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === '已購買' ? '待購買' : '已購買' } : entry) }))} className="rounded-full bg-[#f2f8f3] px-3 py-1.5 text-xs font-medium text-[#3d8d57]">{item.status === '已購買' ? '改為未購買' : '已購買'}</button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'food' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">餐廳列表</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Food</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setRestaurantDraft({ ...emptyRestaurant(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增餐廳
                    </button>
                  )}
                </div>

                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-[#7a6a62]" size={16} />
                    <input
                      type="text"
                      value={restaurantSearch}
                      onChange={(event) => setRestaurantSearch(event.target.value)}
                      placeholder="搜尋餐廳或區域"
                      className="h-11 w-full rounded-full border border-[#eeded8] bg-[#fffaf8] pl-10 pr-3 text-sm text-[#1f2937] outline-none"
                    />
                  </div>
                  <select
                    value={restaurantFilter}
                    onChange={(event) => setRestaurantFilter(event.target.value)}
                    className="h-11 rounded-full border border-[#eeded8] bg-[#fffaf8] px-3 text-sm text-[#374151] outline-none"
                  >
                    <option value="全部">全部類型</option>
                    {Array.from(new Set(appData.restaurants.map((item) => item.type))).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {filteredRestaurants.map((restaurant) => (
                    <div key={restaurant.id} className="rounded-[24px] border border-[#f0e6df] bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-[#1f2937]">{restaurant.name}</div>
                          <div className="mt-1 text-xs text-[#6b7280]">{restaurant.type} · {restaurant.area}</div>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setRestaurantDraft(restaurant)}
                            className="rounded-full bg-[#fff3f1] px-2 py-1 text-[10px] font-medium text-[#b23b3b]"
                          >
                            編輯
                          </button>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-[#374151] sm:grid-cols-2">
                        <div>地址：{restaurant.address}</div>
                        <div>預算：{restaurant.budget}</div>
                        <div>營業時間：{restaurant.hours}</div>
                        <div>需要預約：{restaurant.reservation}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-[#4b5563]">{restaurant.notes}</div>
                        <div className="flex gap-2">
                          {canEdit && (
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, restaurants: previous.restaurants.map((entry) => entry.id === restaurant.id ? { ...entry, favorite: !entry.favorite } : entry) }))} className={`rounded-full px-2 py-1 text-[10px] font-medium ${restaurant.favorite ? 'bg-[#fdf2d7] text-[#a6712a]' : 'bg-[#f2f4f7] text-[#4b5563]'}`}>
                              {restaurant.favorite ? '已收藏' : '收藏'}
                            </button>
                          )}
                          <a href={restaurant.link || googleMapsLink(restaurant.address)} target="_blank" rel="noreferrer" className="rounded-full bg-[#d74d4d] px-3 py-1.5 text-xs font-medium text-white">Google Maps</a>
                          {canEdit && (
                            <button type="button" onClick={() => setAppData((previous) => ({ ...previous, restaurants: previous.restaurants.filter((entry) => entry.id !== restaurant.id) }))} className="rounded-full border border-[#eedad3] px-3 py-1.5 text-xs font-medium text-[#4b5563]">刪除</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'info' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">旅遊資訊中心</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Travel Info</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setTravelInfoDraft({ ...emptyInfoItem(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增資訊
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {appData.travelInfo.map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-[#f0e6df] bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-base font-semibold text-[#1f2937]">{item.title}</div>
                        <span className="rounded-full bg-[#fff0ee] px-2 py-1 text-[10px] font-medium text-[#b23b3b]">{item.badge}</span>
                      </div>
                      <p className="mt-3 text-sm text-[#4b5563]">{item.content}</p>
                      {canEdit && (
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => setTravelInfoDraft(item)} className="rounded-full bg-[#fff3f1] px-3 py-1.5 text-xs font-medium text-[#b23b3b]">編輯</button>
                          <button type="button" onClick={() => setAppData((previous) => ({ ...previous, travelInfo: previous.travelInfo.filter((entry) => entry.id !== item.id) }))} className="rounded-full border border-[#eed7d3] px-3 py-1.5 text-xs font-medium text-[#4b5563]">刪除</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activePage === 'notes' && (
            <div className="space-y-4">
              <section className="rounded-[30px] border border-[#efdcd5] bg-[#fffdfa] p-4 shadow-[0_18px_35px_rgba(96,63,55,0.08)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#85736d]">旅行備忘</div>
                    <h2 className="text-2xl font-semibold text-[#1f2937]">Notes</h2>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setNoteDraft({ ...emptyNote(), id: createId() })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#d74d4d] px-3 py-2 text-sm font-medium text-white"
                    >
                      <Plus size={16} />
                      新增備忘
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {appData.notes.map((note) => (
                    <div key={note.id} className="rounded-[24px] border border-[#f0e6df] bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-base font-semibold text-[#1f2937]">{note.title}</div>
                        {canEdit && (
                          <button type="button" onClick={() => setNoteDraft(note)} className="rounded-full bg-[#fff3f1] px-2.5 py-1.5 text-xs font-medium text-[#b23b3b]">編輯</button>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-[#8b7e76]">{note.createdAt}</div>
                      <p className="mt-3 text-sm leading-7 text-[#4b5563]">{note.content}</p>
                      {canEdit && (
                        <div className="mt-3 flex justify-end">
                          <button type="button" onClick={() => setAppData((previous) => ({ ...previous, notes: previous.notes.filter((entry) => entry.id !== note.id) }))} className="rounded-full border border-[#eed7d3] px-3 py-1.5 text-xs font-medium text-[#4b5563]">刪除</button>
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
              <button type="button" onClick={exportData} className="rounded-full bg-[#fff3f1] px-4 py-2 text-sm font-medium text-[#b23b3b]">匯出 JSON</button>
              <label className="rounded-full bg-[#eef3ee] px-4 py-2 text-sm font-medium text-[#2d6a4d] cursor-pointer">
                匯入 JSON
                <input type="file" accept="application/json" className="hidden" onChange={importData} />
              </label>
            </div>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ebdfd9] bg-[#fffdfa]/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
          {navItems.slice(0, 5).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePage(key)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] ${
                activePage === key ? 'bg-[#fcebea] text-[#b23b3b]' : 'text-[#4b5563]'
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
              <div className="text-xl font-semibold text-[#1f2937]">管理者模式</div>
              <button type="button" onClick={() => setShowOwnerGate(false)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <p className="mb-3 text-sm text-[#4b5563]">這個頁面已切換成訪客模式，輸入管理者編碼後即可解鎖編輯權限。</p>
            <input
              type="password"
              value={ownerCodeInput}
              onChange={(event) => setOwnerCodeInput(event.target.value)}
              placeholder="請輸入管理者編碼"
              className="h-11 w-full rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowOwnerGate(false)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={unlockOwnerAccess} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">解鎖編輯</button>
            </div>
          </div>
        </div>
      )}

      {isTripEditorOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">旅遊資訊編輯</div>
              <button type="button" onClick={() => setIsTripEditorOpen(false)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={tripDraft.tripName} onChange={(event) => setTripDraft({ ...tripDraft, tripName: event.target.value })} placeholder="旅行名稱" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.subtitle} onChange={(event) => setTripDraft({ ...tripDraft, subtitle: event.target.value })} placeholder="副標題" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.travelDates} onChange={(event) => setTripDraft({ ...tripDraft, travelDates: event.target.value })} placeholder="旅行日期" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input type="number" value={tripDraft.durationDays} onChange={(event) => setTripDraft({ ...tripDraft, durationDays: Number(event.target.value) || 1 })} placeholder="天數" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input type="number" value={tripDraft.travelers} onChange={(event) => setTripDraft({ ...tripDraft, travelers: Number(event.target.value) || 1 })} placeholder="旅伴人數" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={tripDraft.hotelName} onChange={(event) => setTripDraft({ ...tripDraft, hotelName: event.target.value })} placeholder="飯店名稱" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={tripDraft.hotelAddress} onChange={(event) => setTripDraft({ ...tripDraft, hotelAddress: event.target.value })} placeholder="飯店地址" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIsTripEditorOpen(false)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={saveTripInfo} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {itineraryDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">{itineraryDraft.id ? '編輯行程' : '新增行程'}</div>
              <button type="button" onClick={() => setItineraryDraft(null)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={itineraryDraft.title} onChange={(event) => setItineraryDraft({ ...itineraryDraft, title: event.target.value })} placeholder="行程名稱" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={itineraryDraft.startTime} onChange={(event) => setItineraryDraft({ ...itineraryDraft, startTime: event.target.value })} placeholder="開始時間" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={itineraryDraft.duration} onChange={(event) => setItineraryDraft({ ...itineraryDraft, duration: event.target.value })} placeholder="停留時間" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={itineraryDraft.category} onChange={(event) => setItineraryDraft({ ...itineraryDraft, category: event.target.value })} placeholder="分類" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={itineraryDraft.transport} onChange={(event) => setItineraryDraft({ ...itineraryDraft, transport: event.target.value })} placeholder="交通方式" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={itineraryDraft.address} onChange={(event) => setItineraryDraft({ ...itineraryDraft, address: event.target.value })} placeholder="地址" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <textarea value={itineraryDraft.notes} onChange={(event) => setItineraryDraft({ ...itineraryDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#eddfdb] bg-[#fffaf8] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setItineraryDraft(null)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={updateItineraryItem} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {shoppingDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">{shoppingDraft.id ? '編輯購物項目' : '新增購物項目'}</div>
              <button type="button" onClick={() => setShoppingDraft(null)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={shoppingDraft.name} onChange={(event) => setShoppingDraft({ ...shoppingDraft, name: event.target.value })} placeholder="商品名稱" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={shoppingDraft.brand} onChange={(event) => setShoppingDraft({ ...shoppingDraft, brand: event.target.value })} placeholder="品牌或店家" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={shoppingDraft.area} onChange={(event) => setShoppingDraft({ ...shoppingDraft, area: event.target.value })} placeholder="區域" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={shoppingDraft.preferredStore} onChange={(event) => setShoppingDraft({ ...shoppingDraft, preferredStore: event.target.value })} placeholder="預計購買店家" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input type="number" value={shoppingDraft.budget} onChange={(event) => setShoppingDraft({ ...shoppingDraft, budget: Number(event.target.value) })} placeholder="預算" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input type="number" value={shoppingDraft.actualPrice} onChange={(event) => setShoppingDraft({ ...shoppingDraft, actualPrice: Number(event.target.value) })} placeholder="實際價格" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <textarea value={shoppingDraft.notes} onChange={(event) => setShoppingDraft({ ...shoppingDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#eddfdb] bg-[#fffaf8] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShoppingDraft(null)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={saveShoppingItem} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {restaurantDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">{restaurantDraft.id ? '編輯餐廳' : '新增餐廳'}</div>
              <button type="button" onClick={() => setRestaurantDraft(null)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={restaurantDraft.name} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, name: event.target.value })} placeholder="餐廳名稱" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={restaurantDraft.type} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, type: event.target.value })} placeholder="餐點類型" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={restaurantDraft.area} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, area: event.target.value })} placeholder="區域" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={restaurantDraft.address} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, address: event.target.value })} placeholder="地址" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none sm:col-span-2" />
              <input value={restaurantDraft.budget} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, budget: event.target.value })} placeholder="預算範圍" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={restaurantDraft.hours} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, hours: event.target.value })} placeholder="營業時間" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <textarea value={restaurantDraft.notes} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, notes: event.target.value })} placeholder="備註" className="min-h-24 rounded-xl border border-[#eddfdb] bg-[#fffaf8] p-3 text-sm outline-none sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRestaurantDraft(null)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={saveRestaurant} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {travelInfoDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">{travelInfoDraft.id ? '編輯資訊' : '新增資訊'}</div>
              <button type="button" onClick={() => setTravelInfoDraft(null)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3">
              <input value={travelInfoDraft.title} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, title: event.target.value })} placeholder="標題" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <input value={travelInfoDraft.badge} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, badge: event.target.value })} placeholder="狀態標籤" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <textarea value={travelInfoDraft.content} onChange={(event) => setTravelInfoDraft({ ...travelInfoDraft, content: event.target.value })} placeholder="內容" className="min-h-28 rounded-xl border border-[#eddfdb] bg-[#fffaf8] p-3 text-sm outline-none" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTravelInfoDraft(null)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={saveTravelInfo} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {noteDraft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-[30px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#1f2937]">{noteDraft.id ? '編輯備忘' : '新增備忘'}</div>
              <button type="button" onClick={() => setNoteDraft(null)} className="rounded-full bg-[#f9f3f1] p-2 text-[#4b5563]"><X size={16} /></button>
            </div>
            <div className="grid gap-3">
              <input value={noteDraft.title} onChange={(event) => setNoteDraft({ ...noteDraft, title: event.target.value })} placeholder="標題" className="h-11 rounded-xl border border-[#eddfdb] bg-[#fffaf8] px-3 text-sm outline-none" />
              <textarea value={noteDraft.content} onChange={(event) => setNoteDraft({ ...noteDraft, content: event.target.value })} placeholder="內容" className="min-h-28 rounded-xl border border-[#eddfdb] bg-[#fffaf8] p-3 text-sm outline-none" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteDraft(null)} className="rounded-full border border-[#eed7d4] px-4 py-2 text-sm font-medium text-[#4b5563]">取消</button>
              <button type="button" onClick={saveNote} className="rounded-full bg-[#d74d4d] px-4 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
