import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import type { Direction, Transaction } from '../wallet/wallet-model'
import { TransactionList } from './transaction-list'

@Component({
  selector: 'wallet-transaction-history',
  imports: [LucideDynamicIcon, TransactionList],
  templateUrl: './transaction-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class TransactionHistory {
  readonly rows = input.required<readonly Transaction[]>()
  readonly query = model('')
  readonly direction = model<Direction>('all')
  readonly transactionSelected = output<Transaction>()
  readonly exportRequested = output<void>()

  protected setDirection(value: string): void {
    if (value === 'all' || value === 'in' || value === 'out') this.direction.set(value)
  }
}
