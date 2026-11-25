export interface Transaction {
  id: string
  name: string
  category: string
  date: number
  amount: number
  icon: string
}

export interface Wallet {
  balance: number
  savings: number
  frozen: boolean
  transactions: Transaction[]
}

export const account = {
  name: 'Thet Htar Win',
  number: '009258002589',
  formattedNumber: '009 258 002589',
  cardSuffix: '2589',
} as const

export const people = [
  { name: 'Aung Min', initials: 'AM', color: 'bg-orange-100 text-orange-700' },
  { name: 'Su Su', initials: 'SS', color: 'bg-violet-100 text-violet-700' },
  { name: 'Kyaw Zin', initials: 'KZ', color: 'bg-blue-100 text-blue-700' },
  { name: 'May Thu', initials: 'MT', color: 'bg-rose-100 text-rose-700' },
] as const

export const actions = {
  send: { title: 'Transfer money', label: 'Recipient name or mobile number', category: 'Money sent', icon: 'arrow-up-right' },
  topUp: { title: 'Top up', label: 'Source bank account', category: 'Top up', icon: 'landmark' },
  bill: { title: 'Pay bills', label: 'Biller and customer number', category: 'Bill payment', icon: 'file-text' },
  withdraw: { title: 'Withdraw', label: 'Destination bank account', category: 'Withdrawal', icon: 'arrow-down-to-line' },
  savings: { title: 'Add to savings', label: '', category: 'Savings contribution', icon: 'target' },
} as const

export type Action = keyof typeof actions
export type Direction = 'all' | 'in' | 'out'

export interface Draft {
  action: Action
  amount: number
  target: string
}

export type TransferResult = { draft: Draft } | { error: string }
export type PostResult = { wallet: Wallet; transaction: Transaction } | { error: string }

export const savingsTarget = 1_200_000
export const savingsName = 'New laptop'

const moneyFormatter = new Intl.NumberFormat('en-US')
const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const weekdayFormatter = new Intl.DateTimeFormat('en', { weekday: 'short' })

export function money(amount: number): string {
  return moneyFormatter.format(Math.abs(amount))
}

export function transactionDate(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

function recentDate(days: number, hours: number, minutes: number): number {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.setHours(hours, minutes, 0, 0)
}

export function createDemoWallet(): Wallet {
  return {
    balance: 2_500_000,
    savings: 450_000,
    frozen: false,
    transactions: [
      { id: 'MB-2806001', name: 'Aung Min Thu', category: 'Money received', date: recentDate(0, 10, 30), amount: 50_000, icon: 'arrow-down-left' },
      { id: 'MB-2806002', name: 'City Mart', category: 'Shopping', date: recentDate(0, 9, 15), amount: -25_000, icon: 'shopping-bag' },
      { id: 'MB-2806003', name: 'Internet bill', category: 'Bill payment', date: recentDate(1, 16, 20), amount: -45_000, icon: 'wifi' },
      { id: 'MB-2806004', name: 'Su Su Hlaing', category: 'Money sent', date: recentDate(1, 11, 45), amount: -30_000, icon: 'send' },
      { id: 'MB-2806005', name: 'Monthly salary', category: 'Bank transfer', date: recentDate(4, 9, 0), amount: 850_000, icon: 'landmark' },
    ],
  }
}

export function parseAmount(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function reviewTransfer(wallet: Wallet, action: Action, amountInput: string, targetInput: string): TransferResult {
  const target = action === 'savings' ? savingsName : targetInput.trim()
  if (!target || target.length > 120) return { error: 'Enter a recipient or account using up to 120 characters.' }

  const amount = parseAmount(amountInput)
  if (amount === null) return { error: 'Enter a positive whole MMK amount.' }
  if (action === 'topUp' && !Number.isSafeInteger(wallet.balance + amount)) {
    return { error: 'This top-up would exceed the supported wallet balance.' }
  }
  if (action !== 'topUp' && amount > wallet.balance) {
    return { error: 'The amount exceeds your available balance.' }
  }
  if (wallet.frozen && action !== 'topUp' && action !== 'savings') {
    return { error: 'Unfreeze your card in Cards before making a payment.' }
  }
  if (action === 'savings' && !Number.isSafeInteger(wallet.savings + amount)) {
    return { error: 'This contribution would exceed the supported savings balance.' }
  }

  return { draft: { action, amount, target } }
}

export function postTransfer(wallet: Wallet, draft: Draft): PostResult {
  const checked = reviewTransfer(wallet, draft.action, String(draft.amount), draft.target)
  if ('error' in checked) return checked

  const { action, amount, target } = checked.draft
  const date = Date.now()
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()
  const transaction: Transaction = {
    id: 'MB-' + date + '-' + suffix,
    name: target,
    category: actions[action].category,
    date,
    amount: action === 'topUp' ? amount : -amount,
    icon: actions[action].icon,
  }

  return {
    transaction,
    wallet: {
      ...wallet,
      balance: wallet.balance + transaction.amount,
      savings: action === 'savings' ? wallet.savings + amount : wallet.savings,
      transactions: [transaction, ...wallet.transactions],
    },
  }
}

export function filterTransactions(transactions: Transaction[], query: string, direction: Direction): Transaction[] {
  const normalized = query.trim().toLowerCase()
  return transactions.filter((transaction) =>
    (direction === 'all' || (direction === 'in' ? transaction.amount > 0 : transaction.amount < 0)) &&
    [transaction.name, transaction.category, transaction.id].some((value) => value.toLowerCase().includes(normalized)),
  )
}

export function cashFlow(transactions: Transaction[], days: 7 | 30) {
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const count = days === 7 ? 7 : 6
  const interval = days / count
  const buckets = Array.from({ length: count }, (_, index) => {
    const start = new Date(end)
    start.setDate(end.getDate() - (count - index) * interval + 1)
    const next = new Date(start)
    next.setDate(start.getDate() + interval)
    return { start, next, incoming: 0, outgoing: 0 }
  })

  for (const transaction of transactions) {
    const bucket = buckets.find(({ start, next }) =>
      transaction.date >= start.getTime() && transaction.date < next.getTime(),
    )
    if (!bucket) continue
    if (transaction.amount > 0) bucket.incoming += transaction.amount
    else bucket.outgoing -= transaction.amount
  }

  const max = Math.max(1, ...buckets.flatMap(({ incoming, outgoing }) => [incoming, outgoing]))
  const height = (value: number) => value > 0 ? Math.max(5, value / max * 100) : 0
  return {
    incoming: buckets.reduce((total, bucket) => total + bucket.incoming, 0),
    outgoing: buckets.reduce((total, bucket) => total + bucket.outgoing, 0),
    bars: buckets.map(({ start, incoming, outgoing }) => ({
      label: days === 7 ? weekdayFormatter.format(start) : start.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      incoming,
      outgoing,
      incomingHeight: height(incoming),
      outgoingHeight: height(outgoing),
    })),
  }
}

export function transactionCsv(transactions: Transaction[]): string {
  const document = transactions.map((transaction) => {
    // Escape spreadsheet formulas in the user-editable description.
    const name = /^[\s]*[=+\-@]/.test(transaction.name) ? "'" + transaction.name : transaction.name
    return [transaction.id, '"' + name.replaceAll('"', '""') + '"', '"' + transactionDate(transaction.date) + '"', transaction.amount, 'Completed'].join(',')
  })
  return ['Reference,Description,Date,Amount MMK,Status', ...document].join('\r\n')
}
