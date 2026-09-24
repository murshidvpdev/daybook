export interface User {
  id: string
  email: string
  display_name: string | null
}

export interface RoutineItem {
  id: string
  title: string
  sort_order: number
  completed_today: boolean
}

export interface Routine {
  id: string
  name: string
  time_of_day: string
  sort_order: number
  items: RoutineItem[]
}

export interface Habit {
  id: string
  name: string
  cadence: string
  is_archived: boolean
  completed_today: boolean
  current_streak: number
}

export interface Account {
  id: string
  name: string
  account_type: string
  currency: string
  opening_balance: string
  current_balance: string
}

export interface Category {
  id: string
  name: string
  kind: 'income' | 'expense'
}

export interface CreditCard {
  id: string
  account_id: string
  name: string
  last_four: string | null
  credit_limit: string | null
  due_day: number
  next_due_date: string
  outstanding_balance: string
}

export interface Emi {
  id: string
  account_id: string
  name: string
  monthly_amount: string
  total_installments: number
  installments_paid: number
  due_day: number
  next_due_date: string
  is_completed: boolean
  is_due: boolean
}

export interface Sip {
  id: string
  account_id: string
  name: string
  amount: string
  due_day: number
  next_due_date: string
  is_active: boolean
}

export interface LendingPayment {
  id: string
  amount: string
  paid_on: string
  note: string | null
  account_id: string | null
  transaction_id: string | null
}

export interface Lending {
  id: string
  person_name: string
  phone_number: string | null
  direction: 'lent' | 'borrowed'
  amount: string
  given_on: string
  remind_on: string | null
  note: string | null
  is_settled: boolean
  settled_on: string | null
  transaction_id: string | null
  amount_paid: string
  outstanding: string
  payments: LendingPayment[]
}

export interface ReminderLinks {
  message: string
  sms_link: string
  whatsapp_link: string
}

export interface CreditCardBill {
  id: string
  credit_card_id: string
  period_start: string
  period_end: string
  amount: string
  due_date: string
  is_paid: boolean
  paid_on: string | null
}

export interface CreditCardSpendResult {
  transaction: Transaction
  lending: Lending | null
}

export interface SpendTrendPoint {
  date: string
  total: string
}

export interface CategoryBreakdownItem {
  category_name: string
  total: string
}

export interface AccountBreakdownItem {
  account_name: string
  account_type: string
  total: string
}

export interface FinanceSummary {
  total_balance: string
  total_credit_card_debt: string
  net_worth: string
  spent_this_month: string
  spent_this_month_excluding_lending: string
  income_this_month: string
  outstanding_lent: string
  outstanding_borrowed: string
  top_spend_account: AccountBreakdownItem | null
}

export interface Transaction {
  id: string
  account_id: string
  category_id: string | null
  kind: 'income' | 'expense'
  amount: string
  note: string | null
  occurred_on: string
}

export interface Exercise {
  id: string
  name: string
  muscle_group: string | null
}

export interface ExerciseSet {
  id: string
  exercise_id: string
  set_number: number
  reps: number
  weight_kg: string | null
}

export interface WorkoutSession {
  id: string
  name: string
  performed_on: string
  duration_minutes: number | null
  notes: string | null
  sets: ExerciseSet[]
}

export interface TodaySummary {
  date: string
  routines: { completed: number; total: number }
  habits: { completed: number; total: number }
  finance: { spent_today: number; currency: string }
  fitness: { last_workout_on: string | null; logged_today: boolean }
}

export interface DayReport {
  report_date: string
  routine_items_done: { routine_name: string; item_title: string }[]
  routine_items_total: number
  habits_done: { name: string }[]
  habits_total: number
  transactions: {
    account_name: string
    category_name: string | null
    kind: 'income' | 'expense'
    amount: string
    note: string | null
  }[]
  total_spent: string
  total_income: string
  workouts: {
    name: string
    duration_minutes: number | null
    notes: string | null
    sets: { exercise_name: string; reps: number; weight_kg: string | null }[]
  }[]
  lendings: { person_name: string; direction: 'lent' | 'borrowed'; amount: string }[]
}
