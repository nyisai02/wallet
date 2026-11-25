import { ChangeDetectionStrategy, Component, output } from '@angular/core'
import { people } from '../wallet/wallet-model'

@Component({
  selector: 'wallet-quick-contacts',
  templateUrl: './quick-contacts.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class QuickContacts {
  readonly contactSelected = output<string>()
  protected readonly people = people
}
