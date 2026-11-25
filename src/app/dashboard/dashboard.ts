import { ChangeDetectionStrategy, Component, computed, inject, model, output } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { SavingsProgress } from '../savings/savings-progress'
import { TransactionList } from '../transactions/transaction-list'
import { QuickContacts } from '../transfers/quick-contacts'
import { WalletCard } from '../wallet/wallet-card'
import { cashFlow, money, type Action, type Transaction } from '../wallet/wallet-model'
import { WalletStore } from '../wallet/wallet-store'

@Component({
  selector: 'wallet-dashboard',
  imports: [LucideDynamicIcon, QuickContacts, SavingsProgress, TransactionList, WalletCard],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-5 sm:space-y-6' },
})
export class Dashboard {
  readonly hideBalance = model(false)
  readonly period = model<7 | 30>(7)
  readonly actionRequested = output<{ action: Action; recipient?: string }>()
  readonly screenRequested = output<'Transactions' | 'Cards' | 'Transfers' | 'Savings goals'>()
  readonly transactionSelected = output<Transaction>()
  readonly qrRequested = output<void>()
  readonly cardRequested = output<void>()

  private readonly store = inject(WalletStore)
  protected readonly account = this.store.account
  protected readonly currency = this.store.currency
  protected readonly connected = this.store.session
  protected readonly money = money
  protected readonly wallet = this.store.wallet
  protected readonly recentTransactions = computed(() => this.wallet().transactions.slice(0, 4))
  protected readonly flow = computed(() => cashFlow(this.wallet().transactions, this.period()))
  private readonly allActions = [
    { title: 'Transfer', icon: 'arrow-up-right', action: 'send' },
    { title: 'Top up', icon: 'plus', action: 'topUp' },
    { title: 'Pay bills', icon: 'file-text', action: 'bill' },
    { title: 'Withdraw', icon: 'arrow-down-to-line', action: 'withdraw' },
  ] as const
  protected readonly quickActions = computed(() => this.connected()
    ? this.allActions.filter(item => item.action !== 'bill')
    : this.allActions)

}
