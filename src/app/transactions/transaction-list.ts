import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { money, transactionDate, type Transaction } from '../wallet/wallet-model'

@Component({
  selector: 'wallet-transaction-list',
  imports: [LucideDynamicIcon],
  templateUrl: './transaction-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TransactionList {
  readonly rows = input.required<readonly Transaction[]>()
  readonly transactionSelected = output<Transaction>()

  protected readonly money = money
  protected readonly transactionDate = transactionDate
}
