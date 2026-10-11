import type { TravelInfoItem } from '../types'

export const travelInfoSample: TravelInfoItem[] = [
  {
    id: 'info-1',
    title: '航班資訊',
    badge: '待填寫',
    content: '尚未確認航班資訊，請先於出發前補上航班號碼、起降時間與登機門。',
  },
  {
    id: 'info-2',
    title: '飯店資訊',
    badge: '待確認',
    content: '住宿地點為 東京灣飯店，請確認房型、入住時間與退房時間。',
  },
  {
    id: 'info-3',
    title: '機場交通',
    badge: '待填寫',
    content: '請補上從機場到飯店的交通方式、預估時間與接駁資訊。',
  },
  {
    id: 'info-4',
    title: '交通卡與車票備忘',
    badge: '待確認',
    content: 'Suica / PASMO 建議提前購買。確認出發日適用範圍與儲值金額。',
  },
  {
    id: 'info-5',
    title: '行李清單',
    badge: '規劃中',
    content: '請補上日常藥品、充電器、相機、雨具與必備證件。',
  },
  {
    id: 'info-6',
    title: '緊急聯絡資訊',
    badge: '待填寫',
    content: '請填寫旅伴聯絡方式、飯店櫃檯電話與當地緊急聯絡資訊。',
  },
  {
    id: 'info-7',
    title: '網路及 Wi-Fi',
    badge: '待確認',
    content: '可準備 eSIM / 實體 SIM 卡，確認飯店是否提供免費 Wi-Fi。',
  },
]
