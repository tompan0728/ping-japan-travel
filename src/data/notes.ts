import type { NoteItem } from '../types'

export const notesSample: NoteItem[] = [
  {
    id: 'note-1',
    title: '臨時想去的景點',
    content: '可再加入 Ueno 公園、天橋立風景店、不同區域的見學點。',
    createdAt: '2026-04-01',
  },
  {
    id: 'note-2',
    title: '朋友建議',
    content: '預約夜景餐廳與拍照點，記得確認是否需要提前預約。',
    createdAt: '2026-04-02',
  },
  {
    id: 'note-3',
    title: '旅行注意事項',
    content: '記得帶充電器、雨具與小型藥盒，出發前確認行程是否重疊。',
    createdAt: '2026-04-05',
  },
]
