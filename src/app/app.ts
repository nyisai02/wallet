import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { Dashboard } from './dashboard/dashboard'
import { QrPayments } from './qr/qr-payments'
import { SavingsProgress } from './savings/savings-progress'
import { download } from './shared/download'
import { TransactionHistory } from './transactions/transaction-history'
import { QuickContacts } from './transfers/quick-contacts'
import { WalletCard } from './wallet/wallet-card'
import { WalletStore } from './wallet/wallet-store'
import {
  account,
  actions,
  filterTransactions,
  money,
  transactionCsv,
  transactionDate,
  type Action,
  type Direction,
  type Draft,
  type Transaction,
} from './wallet/wallet-model'

const navigation = [
  { title: 'Overview', icon: 'house' },
  { title: 'My wallets', icon: 'wallet' },
  { title: 'Transactions', icon: 'arrow-down-left' },
  { title: 'Transfers', icon: 'send' },
  { title: 'Payments', icon: 'credit-card' },
  { title: 'Cards', icon: 'credit-card' },
  { title: 'Savings goals', icon: 'target' },
  { title: 'Settings', icon: 'settings' },
  { title: 'Help & support', icon: 'circle-help' },
] as const

type Screen = typeof navigation[number]['title']
type Modal = 'action' | 'receipt' | 'qr' | 'notifications' | 'security' | 'card'

@Component({
  selector: 'wallet-app',
  imports: [
    Dashboard, LucideDynamicIcon, NgTemplateOutlet, QrPayments, QuickContacts,
    SavingsProgress, TransactionHistory, WalletCard,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly store = inject(WalletStore)
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog')
  private toastTimer?: ReturnType<typeof setTimeout>

  protected readonly account = account
  protected readonly actions = actions
  protected readonly money = money
  protected readonly transactionDate = transactionDate
  protected readonly navigation = navigation
  protected readonly active = signal<Screen>('Overview')
  protected readonly wallet = this.store.wallet
  protected readonly hideBalance = signal(false)
  protected readonly query = signal('')
  protected readonly direction = signal<Direction>('all')
  protected readonly period = signal<7 | 30>(7)
  protected readonly mobileMenu = signal(false)
  protected readonly modal = signal<Modal | null>(null)
  protected readonly action = signal<Action>('send')
  protected readonly recipient = signal('')
  protected readonly amount = signal('')
  protected readonly error = signal('')
  protected readonly draft = signal<Draft | null>(null)
  protected readonly receipt = signal<Transaction | null>(null)
  protected readonly notice = signal('')
  protected readonly unread = signal(true)
  protected readonly lastNotification = signal<Transaction | null>(null)
  protected readonly notificationsEnabled = signal(true)

  protected readonly bills = [
    { name: 'Mobile top-up', icon: 'smartphone', note: 'Prepaid mobile credit' },
    { name: 'Electricity', icon: 'zap', note: 'Pay an electricity bill' },
    { name: 'Internet', icon: 'wifi', note: 'Pay an internet bill' },
  ] as const

  protected readonly mobileNavigation = [
    { screen: 'Overview', label: 'Home', icon: 'house' },
    { screen: 'Transactions', label: 'History', icon: 'arrow-down-left' },
    { screen: 'My wallets', label: 'Wallet', icon: 'wallet' },
    { screen: 'Settings', label: 'Profile', icon: 'user' },
  ] as const

  protected readonly visibleTransactions = computed(() =>
    filterTransactions(this.wallet().transactions, this.query(), this.direction()),
  )
  protected readonly modalTitle = computed(() => {
    switch (this.modal()) {
      case 'action': return this.receipt() ? 'All done!' : actions[this.action()].title
      case 'receipt': return 'Transaction details'
      case 'qr': return 'QR payments'
      case 'notifications': return 'Notifications'
      case 'security': return 'Security center'
      case 'card': return 'Card details'
      default: return ''
    }
  })

  protected navigate(screen: Screen, preserveQuery = false): void {
    if (!preserveQuery) this.query.set('')
    this.active.set(screen)
    this.mobileMenu.set(false)
    window.scrollTo({ top: 0 })
  }

  protected findTransactions(event: Event): void {
    event.preventDefault()
    this.direction.set('all')
    this.navigate('Transactions', true)
  }

  protected showAction(action: Action, target = '', amount = ''): void {
    this.action.set(action)
    this.recipient.set(target)
    this.amount.set(amount)
    this.showPanel('action')
  }

  protected showPanel(panel: Modal, transaction: Transaction | null = null): void {
    this.draft.set(null)
    this.receipt.set(transaction)
    this.error.set('')
    this.modal.set(panel)
    const dialog = this.dialog().nativeElement
    if (!dialog.open) dialog.showModal()
  }

  protected closeModal(): void {
    this.modal.set(null)
    this.dialog().nativeElement.close()
  }

  protected clearClosedModal(): void {
    if (!this.dialog().nativeElement.open) this.modal.set(null)
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.closeModal()
  }

  protected review(event: Event): void {
    event.preventDefault()
    const result = this.store.review(this.action(), this.amount(), this.recipient())
    if ('error' in result) {
      this.error.set(result.error)
      return
    }

    this.error.set('')
    this.draft.set(result.draft)
  }

  protected confirm(): void {
    const draft = this.draft()
    if (!draft || this.receipt()) return
    const result = this.store.post(draft)
    if ('error' in result) {
      this.error.set(result.error)
      this.draft.set(null)
      return
    }

    this.receipt.set(result.transaction)
    if (this.notificationsEnabled()) {
      this.lastNotification.set(result.transaction)
      this.unread.set(true)
    }
  }

  protected openHistory(): void {
    this.closeModal()
    this.direction.set('all')
    this.navigate('Transactions')
  }

  protected flipCard(): void {
    const frozen = this.store.toggleCardFreeze()
    this.toast(frozen ? 'Demo card frozen' : 'Demo card unfrozen')
  }

  protected markRead(): void {
    this.unread.set(false)
    this.closeModal()
    this.toast('Notifications marked as read')
  }

  protected saveStatement(transaction?: Transaction): void {
    const transactions = transaction ? [transaction] : this.visibleTransactions()
    download(transactionCsv(transactions), 'text/csv;charset=utf-8', transaction ? transaction.id + '.csv' : 'wallet-demo-statement.csv')
    this.toast(transaction ? 'Receipt downloaded' : 'Statement downloaded')
  }

  private toast(message: string): void {
    clearTimeout(this.toastTimer)
    this.notice.set(message)
    this.toastTimer = setTimeout(() => this.notice.set(''), 3500)
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer)
  }
}
