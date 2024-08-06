import * as THREE from 'three'

export type Options = {
  dpr?: number
  matrixAutoUpdate?: boolean
  size?: [number, number]
  renderTargetOptions?: THREE.RenderTargetOptions
}

export abstract class FrameBuffer {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  protected readonly renderTarget: THREE.WebGLRenderTarget
  private readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial, THREE.Object3DEventMap>

  constructor(
    protected readonly renderer: THREE.WebGLRenderer,
    material: THREE.RawShaderMaterial,
    private options?: Options,
  ) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera()
    this.renderTarget = this.createRenderTarget()
    this.screen = this.createScreen(material)

    this.setMatrixAutoUpdate(options?.matrixAutoUpdate ?? false)
  }

  private get devicePixelRatio() {
    return this.options?.dpr ?? this.renderer.getPixelRatio()
  }

  private setMatrixAutoUpdate(v: boolean) {
    this.camera.matrixAutoUpdate = v
    this.scene.traverse((o) => (o.matrixAutoUpdate = v))
  }

  get size() {
    const width = (this.options?.size?.[0] ?? this.renderer.domElement.width) * this.devicePixelRatio
    const height = (this.options?.size?.[1] ?? this.renderer.domElement.height) * this.devicePixelRatio
    return { width, height }
  }

  protected createRenderTarget() {
    return new THREE.WebGLRenderTarget(this.size.width, this.size.height, this.options?.renderTargetOptions)
  }

  private createScreen(material: THREE.RawShaderMaterial) {
    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(geometry, material)
    this.scene.add(mesh)
    return mesh
  }

  get uniforms() {
    return this.screen.material.uniforms
  }

  resize() {
    this.renderTarget.setSize(this.size.width, this.size.height)
  }

  get texture() {
    return this.renderTarget.texture
  }

  render(..._args: any[]) {
    this.renderer.setRenderTarget(this.renderTarget)
    this.renderer.render(this.scene, this.camera)
  }
}
