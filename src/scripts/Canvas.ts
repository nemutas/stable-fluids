import * as THREE from 'three'
import { OrthographicCamera } from './core/Camera'
import { RawShaderMaterial } from './core/ExtendedMaterials'
import { Three } from './core/Three'
import { pane } from './Gui'
import { shader, ShaderName } from './shader/shaders'

export class Canvas extends Three {
  private readonly PIXEL_RATIO = 2 // 解像度に対する係数
  private readonly DIFFUSE_ITERATION = 1 // 拡散計算のイテレーション回数
  private readonly PROJECT_ITERATION = 16 // 質量計算のイテレーション回数

  private velocityFramebuffers: THREE.WebGLRenderTarget[] = []
  private densityFramebuffers: THREE.WebGLRenderTarget[] = []
  private projectFramebuffers: THREE.WebGLRenderTarget[] = []

  private params = {
    timeStep: 0.005,
    forceRadius: 0.03,
    forceIntensity: 20,
    forceAttenuation: 0.01,
    diffuse: 0,
    additionalVelocity: 0,
  }

  private mouse = {
    press: false,
    move: false,
    position: [0, 0],
    prevPosition: [0, 0],
    direction: [0, 0],
    length: 1,
  }

  isAdditional = false
  isDrawDensity = true

  private camera: OrthographicCamera

  constructor(canvas: HTMLCanvasElement) {
    super(canvas)
    this.camera = new OrthographicCamera()
    this.init()
    this.setGui()

    window.addEventListener('resize', this.resize.bind(this))
    this.renderer.setAnimationLoop(this.anime.bind(this))
  }

  private init() {
    this.addPointerEvents()
    this.createMeshes()
    this.createFrameBuffers()
    this.resetFrameBuffers()
  }

  private setGui() {
    pane.title = 'paramaters'
    pane.addFpsBlade()
    pane.addBinding(this, 'isDrawDensity', { label: 'draw_density' })
    pane.addBinding(this, 'isAdditional', { label: 'additional_velocity' }).on('change', (v) => {
      this.params.additionalVelocity = v.value ? 1 : 0
      this.resetFrameBuffers()
    })
    pane.addBinding(this.params, 'timeStep', { min: 0.001, max: 0.01, step: 0.001, label: 'time_step' })
    pane.addBinding(this.params, 'forceRadius', { min: 0.001, max: 0.1, step: 0.001, label: 'force_radius' })
    pane.addBinding(this.params, 'forceIntensity', { min: 1, max: 100, step: 1, label: 'force_intensity' })
    pane.addBinding(this.params, 'forceAttenuation', { min: 0, max: 0.1, step: 0.001, label: 'force_attenuation' })
    pane.addBinding(this.params, 'diffuse', { min: 0, max: 0.1, step: 0.001, label: 'diffuse' })
    pane.addButton({ title: 'reset buffer' }).on('click', () => this.resetFrameBuffers())
  }

  private get bufferSize() {
    return {
      width: Math.ceil(this.size.width / this.PIXEL_RATIO / this.renderer.getPixelRatio()),
      height: Math.ceil(this.size.height / this.PIXEL_RATIO / this.renderer.getPixelRatio()),
    }
  }

  private get resolution() {
    return [this.bufferSize.width, this.bufferSize.height]
  }

  private createFrameBuffers() {
    const { width, height } = this.bufferSize

    const create = () => {
      return new THREE.WebGLRenderTarget(width, height, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
      })
    }

    this.velocityFramebuffers = [create(), create()]
    this.densityFramebuffers = [create(), create()]
    this.projectFramebuffers = [create(), create()]
  }

  private resetFrameBuffers() {
    this.velocityFramebuffers.forEach((buffer) => {
      this.use('resetVelocity')
      this.bind(buffer)
      this.render()
      this.bind(null)
    })

    this.densityFramebuffers.forEach((buffer) => {
      this.use('resetDensity')
      this.bind(buffer)
      this.render()
      this.bind(null)
    })

    this.projectFramebuffers.forEach((buffer) => {
      this.use('resetProject')
      this.bind(buffer)
      this.render()
      this.bind(null)
    })
  }

  private addPointerEvents() {
    const pointermoveHandler = (e: PointerEvent | Touch) => {
      if (!this.mouse.press) {
        this.mouse.move = false
        return
      }
      const vx = e.clientX - this.mouse.prevPosition[0]
      const vy = e.clientY - this.mouse.prevPosition[1]
      const length = Math.hypot(vx, vy)
      this.mouse.prevPosition[0] = e.clientX
      this.mouse.prevPosition[1] = e.clientY
      this.mouse.position[0] = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.position[1] = -((e.clientY / window.innerHeight) * 2 - 1)
      if (length === 0) {
        this.mouse.direction[0] = 0
        this.mouse.direction[1] = 0
      } else {
        this.mouse.direction[0] = vx / length
        this.mouse.direction[1] = -vy / length
      }
      this.mouse.length = 1 + length
      this.mouse.move = true
    }

    this.canvas.addEventListener('pointermove', (e) => {
      pointermoveHandler(e)
    })

    this.canvas.addEventListener('touchmove', (e) => {
      if (0 < e.touches.length) {
        pointermoveHandler(e.touches[0])
      }
    })

    this.canvas.addEventListener('pointerdown', (e) => {
      this.mouse.press = true
      this.mouse.prevPosition[0] = e.clientX
      this.mouse.prevPosition[1] = e.clientY
    })

    this.canvas.addEventListener('pointerup', () => {
      this.mouse.press = false
      this.mouse.move = false
    })
  }

  private createMesh(name: ShaderName, uniforms?: { [uniform: string]: THREE.IUniform<any> }) {
    const geo = new THREE.PlaneGeometry(2, 2)
    const mat = new RawShaderMaterial({
      uniforms: uniforms ?? {},
      vertexShader: shader.base,
      fragmentShader: shader[name],
      glslVersion: '300 es',
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = name
    this.scene.add(mesh)
    return mesh
  }

  private createMeshes() {
    this.createMesh('resetVelocity')
    this.createMesh('resetDensity')
    this.createMesh('resetProject')

    this.createMesh('diffuseVelocity', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
      dt: { value: this.params.timeStep },
      diffuse: { value: this.params.diffuse },
    })
    this.createMesh('diffuseDensity', {
      resolution: { value: this.resolution },
      densityTexture: { value: null },
      dt: { value: this.params.timeStep },
      diffuse: { value: this.params.diffuse },
    })

    this.createMesh('advectVelocity', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
      dt: { value: this.params.timeStep },
      attenuation: { value: this.params.forceAttenuation },
    })
    this.createMesh('advectDensity', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
      densityTexture: { value: null },
      dt: { value: this.params.timeStep },
      additionalVelocity: { value: this.params.additionalVelocity },
    })

    this.createMesh('projectBegin', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
    })
    this.createMesh('projectLoop', {
      resolution: { value: this.resolution },
      projectTexture: { value: null },
    })
    this.createMesh('projectEnd', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
      projectTexture: { value: null },
    })

    this.createMesh('forceVelocity', {
      resolution: { value: this.resolution },
      velocityTexture: { value: null },
      dt: { value: this.params.timeStep },
      forceRadius: { value: this.params.forceRadius },
      forceIntensity: { value: this.params.forceIntensity },
      forceDirection: { value: this.mouse.direction },
      forceOrigin: { value: this.mouse.position },
    })

    this.createMesh('renderVelocity', {
      velocityTexture: { value: null },
    })
    this.createMesh('renderDensity', {
      densityTexture: { value: null },
    })
  }

  private updateVelocity() {
    // マウスカーソルが押下＋移動の場合、速度を加算する
    if (this.mouse.press && this.mouse.move) {
      this.mouse.move = false
      const uniforms = this.material('forceVelocity').uniforms
      uniforms.resolution.value = this.resolution
      uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
      uniforms.dt.value = this.params.timeStep
      uniforms.forceRadius.value = this.params.forceRadius
      uniforms.forceIntensity.value = this.params.forceIntensity * this.mouse.length
      uniforms.forceDirection.value = this.mouse.direction
      uniforms.forceOrigin.value = this.mouse.position
      this.use('forceVelocity')
      this.bind(this.velocityFramebuffers[0])
      this.render()
      this.swap(this.velocityFramebuffers)
    }

    // 拡散が設定されている場合計算する
    if (0 < this.params.diffuse) {
      this.use('diffuseVelocity')
      for (let i = 0; i < this.DIFFUSE_ITERATION; i++) {
        const uniforms = this.material('diffuseVelocity').uniforms
        uniforms.resolution.value = this.resolution
        uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
        uniforms.dt.value = this.params.timeStep
        uniforms.diffuse.value = this.params.diffuse
        this.bind(this.velocityFramebuffers[0])
        this.render()
        this.swap(this.velocityFramebuffers)
      }
    }

    // 質量の計算と移流を計算する
    this.updateProject()
    const uniforms = this.material('advectVelocity').uniforms
    uniforms.resolution.value = this.resolution
    uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
    uniforms.dt.value = this.params.timeStep
    uniforms.attenuation.value = this.params.forceAttenuation
    this.use('advectVelocity')
    this.bind(this.velocityFramebuffers[0])
    this.render()
    this.swap(this.velocityFramebuffers)
    this.updateProject()
  }

  private updateDensity() {
    // 拡散が設定されている場合計算する
    if (0 < this.params.diffuse) {
      this.use('diffuseDensity')
      for (let i = 0; i < this.DIFFUSE_ITERATION; i++) {
        const uniforms = this.material('diffuseDensity').uniforms
        uniforms.resolution.value = this.resolution
        uniforms.densityTexture.value = this.texture(this.densityFramebuffers[1])
        uniforms.dt.value = this.params.timeStep
        uniforms.diffuse.value = this.params.diffuse
        this.bind(this.densityFramebuffers[0])
        this.render()
        this.swap(this.densityFramebuffers)
      }
    }

    // 速度に応じて濃度を更新する
    const uniforms = this.material('advectDensity').uniforms
    uniforms.resolution.value = this.resolution
    uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
    uniforms.densityTexture.value = this.texture(this.densityFramebuffers[1])
    uniforms.dt.value = this.params.timeStep
    uniforms.additionalVelocity.value = this.params.additionalVelocity
    this.use('advectDensity')
    this.bind(this.densityFramebuffers[0])
    this.render()
    this.swap(this.densityFramebuffers)
  }

  private updateProject() {
    {
      const uniforms = this.material('projectBegin').uniforms
      uniforms.resolution.value = this.resolution
      uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
      this.use('projectBegin')
      this.bind(this.projectFramebuffers[0])
      this.render()
      this.swap(this.projectFramebuffers)
    }

    this.use('projectLoop')
    for (let i = 0; i < this.PROJECT_ITERATION; i++) {
      const uniforms = this.material('projectLoop').uniforms
      uniforms.resolution.value = this.resolution
      uniforms.projectTexture.value = this.texture(this.projectFramebuffers[1])
      this.bind(this.projectFramebuffers[0])
      this.render()
      this.swap(this.projectFramebuffers)
    }

    {
      const uniforms = this.material('projectEnd').uniforms
      uniforms.resolution.value = this.resolution
      uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
      uniforms.projectTexture.value = this.texture(this.projectFramebuffers[1])
      this.use('projectEnd')
      this.bind(this.velocityFramebuffers[0])
      this.render()
      this.swap(this.velocityFramebuffers)
    }
  }

  private renderToDensity() {
    const uniforms = this.material('renderDensity').uniforms
    uniforms.densityTexture.value = this.texture(this.densityFramebuffers[1])
    this.use('renderDensity')
    this.bind(null)
    this.render()
  }

  private renderToVelocity() {
    const uniforms = this.material('renderVelocity').uniforms
    uniforms.velocityTexture.value = this.texture(this.velocityFramebuffers[1])
    this.use('renderVelocity')
    this.bind(null)
    this.render()
  }

  private anime() {
    pane.updateFps()

    this.updateVelocity()
    this.updateDensity()
    if (this.isDrawDensity) {
      this.renderToDensity()
    } else {
      this.renderToVelocity()
    }
  }

  private resize() {
    for (const buffer of this.velocityFramebuffers) {
      buffer.setSize(this.bufferSize.width, this.bufferSize.height)
    }
    for (const buffer of this.densityFramebuffers) {
      buffer.setSize(this.bufferSize.width, this.bufferSize.height)
    }
    for (const buffer of this.projectFramebuffers) {
      buffer.setSize(this.bufferSize.width, this.bufferSize.height)
    }
    this.resetFrameBuffers()
  }

  // ------------------
  // utility functions
  private use(name: ShaderName) {
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.visible = child.name === name
      }
    })
  }

  private bind(renderTarget: THREE.WebGLRenderTarget | null) {
    this.renderer.setRenderTarget(renderTarget)
  }

  private material(name: ShaderName) {
    return (this.scene.getObjectByName(name) as THREE.Mesh<THREE.PlaneGeometry, RawShaderMaterial>).material
  }

  private swap(targets: THREE.WebGLRenderTarget[]) {
    const temp = targets[0]
    targets[0] = targets[1]
    targets[1] = temp
  }

  private texture(renderTarget: THREE.WebGLRenderTarget) {
    return renderTarget.texture
  }

  protected render() {
    this.renderer.render(this.scene, this.camera)
  }
}
