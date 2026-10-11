export type PageKey = 'home' | 'itinerary' | 'map' | 'shopping' | 'food' | 'info' | 'notes'

export type PlaceCategory = '景點' | '美食' | '購物' | '飯店' | '其他'

export interface TripInfo {
  tripName: string
  subtitle: string
  travelDates: string
  durationDays: number
  travelers: number
  hotelName: string
  hotelAddress: string
}

export interface ItineraryItem {
  id: string
  title: string
  category: string
  startTime: string
  address: string
  duration: string
  transport: string
  notes: string
  link: string
  completed: boolean
}

export interface ItineraryDay {
  id: string
  date: string
  label: string
  items: ItineraryItem[]
}

export interface Place {
  id: string
  name: string
  category: PlaceCategory
  area: string
  address: string
  notes: string
  link: string
  color: string
}

export interface ShoppingItem {
  id: string
  name: string
  brand: string
  area: string
  preferredStore: string
  budget: number
  actualPrice: number
  status: '待購買' | '已購買'
  notes: string
}

export interface Restaurant {
  id: string
  name: string
  type: string
  address: string
  area: string
  budget: string
  hours: string
  reservation: '需要' | '可視情況' | '不需要'
  link: string
  notes: string
  favorite: boolean
  confirmed: boolean
}

export interface TravelInfoItem {
  id: string
  title: string
  content: string
  badge: string
}

export interface NoteItem {
  id: string
  title: string
  content: string
  createdAt: string
}

export interface TravelAppData {
  trip: TripInfo
  itineraryDays: ItineraryDay[]
  places: Place[]
  shoppingItems: ShoppingItem[]
  restaurants: Restaurant[]
  travelInfo: TravelInfoItem[]
  notes: NoteItem[]
}
