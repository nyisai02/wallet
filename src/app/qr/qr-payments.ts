import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, output, signal, viewChild } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import { download } from '../shared/download'
import { createQrPayload, readQrPayload, type QrPayment } from './qr-payload'
import { account, money, parseAmount } from '../wallet/wallet-model'

@Component({
  selector: 'wallet-qr-payments',
  imports: [LucideDynamicIcon],
  templateUrl: './qr-payments.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrPayments {
  readonly pay = output<QrPayment>()

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video')
  private stream?: MediaStream
  private timer?: ReturnType<typeof setInterval>
  private scanId = 0

  protected readonly account = account
  protected readonly money = money
  protected readonly mode = signal<'pay' | 'receive'>('pay')
  protected readonly amount = signal('')
  protected readonly parsedAmount = computed(() => parseAmount(this.amount()))
  protected readonly validAmount = computed(() => this.amount().trim() === '' || this.parsedAmount() !== null)
  protected readonly state = signal<'idle' | 'starting' | 'camera' | 'image'>('idle')
  protected readonly error = signal('')
  protected readonly status = signal('')
  protected readonly svg = signal('')
  protected readonly imageUrl = computed(() =>
    this.svg() ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.svg()) : '',
  )

  constructor() {
    effect((onCleanup) => {
      if (this.mode() !== 'receive') return
      const amount = this.amount()
      this.svg.set('')
      if (amount.trim() && !this.validAmount()) return
      const payload = createQrPayload(this.parsedAmount())
      let current = true
      onCleanup(() => { current = false })

      void import('qrcode').then(({ default: qr }) =>
        qr.toString(payload, { type: 'svg', width: 224, margin: 4, color: { dark: '#172e63', light: '#ffffff' } }),
      ).then((svg) => {
        if (current) this.svg.set(svg)
      }).catch(() => {
        if (current) this.error.set('The QR code could not be generated.')
      })
    })
  }

  protected selectMode(mode: 'pay' | 'receive'): void {
    if (this.mode() === mode) return
    this.stop()
    this.error.set('')
    this.status.set('')
    this.mode.set(mode)
  }

  protected setAmount(value: string): void {
    if (value === this.amount()) return
    this.svg.set('')
    this.error.set('')
    this.status.set('')
    this.amount.set(value)
  }

  protected saveQr(): void {
    if (!this.svg() || !this.validAmount()) return
    download(this.svg(), 'image/svg+xml;charset=utf-8', 'wallet-demo-receive-qr.svg')
    this.status.set('QR code downloaded.')
  }

  protected async copyAccount(): Promise<void> {
    try {
      await navigator.clipboard.writeText(account.number)
      this.status.set('Demo account number copied.')
    } catch {
      this.status.set('Demo account number: ' + account.number)
    }
  }

  protected tryPayment(): void {
    this.stop()
    this.pay.emit({ recipient: 'MyBank demo merchant', amount: '' })
  }

  protected stop(): void {
    this.scanId++
    clearInterval(this.timer)
    this.timer = undefined
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    const player = this.video()?.nativeElement
    if (player) player.srcObject = null
    this.state.set('idle')
  }

  protected async startCamera(): Promise<void> {
    this.stop()
    this.error.set('')
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera scanning requires an HTTPS or localhost connection. You can still choose a QR image.')
      return
    }

    const scan = this.scanId
    this.state.set('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (scan !== this.scanId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      this.stream = stream
      const player = this.video()?.nativeElement
      if (!player) throw new Error('Camera preview is unavailable.')
      player.srcObject = stream
      const [{ default: decode }] = await Promise.all([import('jsqr'), player.play()])
      if (scan !== this.scanId) return

      const surface = this.createScanSurface()
      this.state.set('camera')
      this.timer = setInterval(() => {
        if (scan !== this.scanId || player.readyState < 2 || !player.videoWidth || !player.videoHeight) return
        try {
          const pixels = this.capture(surface, player, player.videoWidth, player.videoHeight, 800)
          const code = decode(pixels.data, pixels.width, pixels.height)
          if (code) this.accept(code.data)
        } catch {
          this.stop()
          this.error.set('The camera frame could not be read. Try again or choose a QR image.')
        }
      }, 250)
    } catch (cause) {
      if (scan !== this.scanId) return
      this.stop()
      const name = cause instanceof Error ? cause.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.error.set('Camera access was blocked. Allow it in your browser settings or choose a QR image.')
      } else if (name === 'NotFoundError') {
        this.error.set('No camera was found. You can still choose a QR image.')
      } else {
        this.error.set('The camera could not start. Choose a QR image or try the camera again.')
      }
    }
  }

  protected async chooseFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    this.stop()
    this.error.set('')
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      this.error.set('Choose a QR image 10 MB or smaller.')
      return
    }

    const scan = this.scanId
    const url = URL.createObjectURL(file)
    this.state.set('image')
    try {
      const image = new Image()
      image.src = url
      const [{ default: decode }] = await Promise.all([import('jsqr'), image.decode()])
      if (scan !== this.scanId) return
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image is empty.')

      const pixels = this.capture(this.createScanSurface(), image, image.naturalWidth, image.naturalHeight, 2048)
      const code = decode(pixels.data, pixels.width, pixels.height)
      if (code) this.accept(code.data)
      else this.error.set('No QR code found. Choose a clear, uncropped image and try again.')
    } catch {
      if (scan === this.scanId) this.error.set('This QR image could not be read.')
    } finally {
      URL.revokeObjectURL(url)
      if (scan === this.scanId) this.state.set('idle')
    }
  }

  private accept(value: string): void {
    this.stop()
    const payment = readQrPayload(value)
    if (payment) this.pay.emit(payment)
    else this.error.set('This QR code is unsupported. Choose a code created with QR to receive.')
  }

  private createScanSurface() {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Image scanning is unavailable in this browser.')
    return { canvas, context }
  }

  private capture(
    { canvas, context }: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D },
    source: CanvasImageSource,
    width: number,
    height: number,
    limit: number,
  ): ImageData {
    const scale = Math.min(1, limit / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    return context.getImageData(0, 0, canvas.width, canvas.height)
  }

  ngOnDestroy(): void {
    this.stop()
  }
}
