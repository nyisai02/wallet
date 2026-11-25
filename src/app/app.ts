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
import { WalletStore, type PaymentReceipt, type WalletDraft } from './wallet/wallet-store'
import { demoHubs, type PartyIdType } from './wallet/demo-wallet-api'
import type { QrPayment } from './qr/qr-payload'
import {
  actions,
  filterTransactions,
  money,
  transactionCsv,
  transactionDate,
  transactionReference,
  type Action,
  type Direction,
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
  private walletRefresh?: Promise<void>

  protected readonly account = this.store.account
  protected readonly session = this.store.session
  protected readonly preview = this.store.preview
  protected readonly currency = this.store.currency
  protected readonly pendingTransfers = this.store.pendingTransfers
  protected readonly initials = computed(() => this.account().name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase())
  protected readonly demoHubs = demoHubs
  protected readonly actions = actions
  protected readonly money = money
  protected readonly transactionDate = transactionDate
  protected readonly transactionReference = transactionReference
  protected readonly navigation = computed(() => this.session()
    ? navigation.filter(item => item.title !== 'Cards' && item.title !== 'Payments' && item.title !== 'Savings goals')
    : navigation)
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
  protected readonly provider = signal('')
  protected readonly partyIdType = signal<PartyIdType>('MSISDN')
  protected readonly subId = signal('')
  protected readonly providers = signal<string[]>([])
  protected readonly amount = signal('')
  protected readonly error = signal('')
  protected readonly connectionError = signal('')
  protected readonly refreshError = signal('')
  protected readonly busy = signal(false)
  protected readonly refreshing = signal(false)
  protected readonly loadingProviders = signal(false)
  protected readonly providersError = signal('')
  protected readonly draft = signal<WalletDraft | null>(null)
  protected readonly receipt = signal<PaymentReceipt | null>(null)
  protected readonly notice = signal('')
  protected readonly unread = signal(false)
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
      case 'action': return this.receipt() ? 'Payment result' :
        this.session() && this.action() === 'topUp' ? 'Deposit funds' : actions[this.action()].title
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

  protected async connect(event: Event, mobileInput: string, currencyInput: string, hub: string): Promise<void> {
    event.preventDefault()
    if (this.busy()) return
    const mobile = mobileInput.trim()
    const currency = currencyInput.trim().toUpperCase()
    const route = demoHubs.find(item => item.id === hub)
    if (!/^\+?\d{5,15}$/.test(mobile) || !/^[A-Z]{3}$/.test(currency) || !route) {
      this.connectionError.set('Enter your Demo Wallet mobile number and a three-letter currency code.')
      return
    }
    this.connectionError.set('')
    this.busy.set(true)
    try {
      await this.store.connect(mobile, currency, route.id)
    } catch (error) {
      this.connectionError.set(this.message(error))
    } finally {
      this.busy.set(false)
    }
  }

  protected openPreview(): void {
    this.connectionError.set('')
    this.store.openPreview()
    this.unread.set(true)
  }

  protected disconnect(): void {
    if (this.busy() || this.refreshing()) return
    this.closeModal()
    this.store.disconnect()
    this.providers.set([])
    this.providersError.set('')
    this.loadingProviders.set(false)
    this.refreshError.set('')
    this.lastNotification.set(null)
    this.unread.set(false)
    this.hideBalance.set(false)
    this.direction.set('all')
    this.navigate('Overview')
  }

  protected refreshWallet(): Promise<void> {
    if (this.walletRefresh) return this.walletRefresh
    this.refreshing.set(true)
    this.refreshError.set('')
    this.walletRefresh = this.store.refresh().catch(error => {
      this.refreshError.set('Wallet data could not be refreshed. ' + this.message(error))
    }).finally(() => {
      this.walletRefresh = undefined
      this.refreshing.set(false)
    })
    return this.walletRefresh
  }

  protected showAction(action: Action, target = '', amount = ''): void {
    if (this.busy()) return
    this.action.set(action)
    this.recipient.set(target)
    this.amount.set(amount)
    this.provider.set('')
    this.partyIdType.set('MSISDN')
    this.subId.set('')
    this.showPanel('action')
    if (this.session() && action === 'send' && !this.providers().length) void this.loadProviders()
  }

  protected useQr(payment: QrPayment): void {
    this.showAction('send', payment.recipient, payment.amount)
    if (payment.provider) this.provider.set(payment.provider)
  }

  protected async loadProviders(): Promise<void> {
    const session = this.session()
    if (!session || this.loadingProviders()) return
    this.loadingProviders.set(true)
    this.providersError.set('')
    try {
      const providers = await this.store.providers()
      if (!providers.length) throw new Error('This Demo Wallet server has no recipient providers configured.')
      if (this.session() === session) this.providers.set(providers)
    } catch (error) {
      if (this.session() === session) this.providersError.set(this.message(error))
    } finally {
      if (this.session() === session) this.loadingProviders.set(false)
    }
  }

  protected showPanel(panel: Modal, transaction: PaymentReceipt | null = null): void {
    if (this.busy()) return
    this.draft.set(null)
    this.receipt.set(transaction)
    this.error.set('')
    this.modal.set(panel)
    const dialog = this.dialog().nativeElement
    if (!dialog.open) dialog.showModal()
  }

  protected closeModal(): void {
    if (this.busy()) return
    this.modal.set(null)
    this.dialog().nativeElement.close()
  }

  protected clearClosedModal(): void {
    if (!this.dialog().nativeElement.open) this.modal.set(null)
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.closeModal()
  }

  protected cancelModal(event: Event): void {
    if (this.busy()) event.preventDefault()
  }

  protected async review(event: Event): Promise<void> {
    event.preventDefault()
    if (this.busy()) return
    this.error.set('')
    this.busy.set(true)
    try {
      const identifier = this.recipient().trim()
      const provider = this.provider()
      const idType = this.partyIdType()
      const subId = this.subId().trim()
      if (this.session() && this.action() === 'send') {
        if (!this.providers().includes(provider)) throw new Error('Select a recipient provider.')
        if (idType === 'MSISDN' ? !/^\+?\d{5,15}$/.test(identifier) : !identifier || identifier.length > 128) {
          throw new Error(idType === 'MSISDN' ? 'Enter a valid recipient mobile number.' : 'Enter a valid recipient account ID.')
        }
        if (idType === 'ACCOUNT_ID' && subId && !/^\+?\d{5,15}$/.test(subId)) {
          throw new Error('Enter a valid optional recipient mobile number.')
        }
      }
      this.draft.set(await this.store.review(this.action(), this.amount(), identifier, { identifier, provider, idType, subId }))
    } catch (error) {
      this.error.set(this.message(error))
    } finally {
      this.busy.set(false)
    }
  }

  protected async confirm(): Promise<void> {
    const draft = this.draft()
    if (!draft || this.receipt() || this.busy()) return
    this.busy.set(true)
    this.error.set('')
    try {
      await this.walletRefresh
      const receipt = await this.store.post(draft)
      this.receipt.set(receipt)
      if (this.notificationsEnabled() && (receipt.status ?? 'Completed') === 'Completed') {
        this.lastNotification.set(receipt)
        this.unread.set(true)
      }
      if (this.session()) await this.refreshWallet()
    } catch (error) {
      this.error.set(this.message(error))
      this.draft.set(null)
    } finally {
      this.busy.set(false)
    }
  }

  protected async refreshTransferStatus(): Promise<void> {
    const receipt = this.receipt()
    if (!receipt?.transferId || this.busy()) return
    this.busy.set(true)
    try {
      this.receipt.set(await this.store.checkStatus(receipt))
      await this.refreshWallet()
    } finally {
      this.busy.set(false)
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
    download(transactionCsv(transactions, this.currency()), 'text/csv;charset=utf-8', transaction ? transaction.id + '.csv' : 'wallet-demo-statement.csv')
    this.toast(transaction ? 'Receipt downloaded' : 'Statement downloaded')
  }

  private toast(message: string): void {
    clearTimeout(this.toastTimer)
    this.notice.set(message)
    this.toastTimer = setTimeout(() => this.notice.set(''), 3500)
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Could not complete the request.'
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer)
  }
}
