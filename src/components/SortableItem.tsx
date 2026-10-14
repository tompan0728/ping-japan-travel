import type { ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type SortableItemProps = {
  id: string
  disabled: boolean
  children: (dragHandle: ReactNode) => ReactNode
}

export function SortableItem({ id, disabled, children }: SortableItemProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled })

  const dragHandle = disabled ? null : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
      aria-label="拖曳調整順序"
      className="touch-none rounded-full border border-[#c7dce8] bg-white p-1.5 text-[#3e586d] shadow-sm active:cursor-grabbing"
    >
      <GripVertical size={16} />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.55 : undefined,
      }}
      className={isDragging ? 'relative' : undefined}
    >
      {children(dragHandle)}
    </div>
  )
}
