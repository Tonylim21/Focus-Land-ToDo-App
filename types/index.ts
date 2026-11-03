export type Priority = 'low' | 'medium' | 'high'

export interface Subtask {
  id: string
  task_id: string
  user_id: string
  title: string
  priority: Priority
  is_done: boolean
  completed_at: string | null
  penalized_at: string | null
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  title: string
  start_date: string // 'YYYY-MM-DD'
  deadline: string // 'YYYY-MM-DD'
  deadline_time: string | null // 'HH:MM:SS'
  created_at: string
  subtasks: Subtask[]
}

export interface Profile {
  id: string
  name: string | null
  phone_number: string | null
  timezone: string | null
  points: number
}
