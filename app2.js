const APOLLO_ALPHABET = {
  'A': '𐠸', 'B': '𐩱', 'C': '𐒂', 'D': '𐠴', 
  'E': '𐐷', 'F': '𐰆', 'G': '𐡄', 'H': '𐎳', 
  'I': '𐑒', 'J': '𐐦', 'K': '𐐗', 'L': '𐠋', 
  'M': '𐡟', 'N': '𐑣', 'O': '𐠤', 'P': '𐒏', 
  'Q': '𐠛', 'R': '𐡌', 'S': '𐑉', 'T': '𐩻', 
  'U': '𐠎', 'V': '𐠏', 'W': '𐠓', 'X': 'ᚉ', 
  'Y': '𐒝', 'Z': '𑀲'
};

function translateToApolloLanguage(text) {
  return text.split('').map(char => {
    const upperChar = char.toUpperCase();
    return APOLLO_ALPHABET[upperChar] || char;
  }).join('');
}

class PageVisualization {
  constructor(containerId, config = {}) {
    this.container = document.getElementById(containerId);
    this.config = {
      nodeCount: config.nodeCount || 50,
      backgroundColor: config.backgroundColor || 0x0a0a1a,
      nodeColor: config.nodeColor || 0x00ffaa,
      connectionColor: config.connectionColor || 0x00ffaa,
      nodeShape: config.nodeShape || 'sphere',
      movementPattern: config.movementPattern || 'subtle',
      lightType: config.lightType || 'point',
      specialConfig: config.specialConfig || null,
      ...config
    };
    this.initializeScene();
    
    if (this.config.specialConfig) {
      this.createSpecialVisualization(this.config.specialConfig);
    } else {
      this.createQuantumNodes();
      this.createConnectionLines();
    }
    
    this.setupLighting();
    this.setupEventListeners();
    this.animate();
  }

  initializeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.backgroundColor);
    
    this.camera = new THREE.PerspectiveCamera(75, this.getAspectRatio(), 0.1, 1000);
    
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.camera.position.z = this.getOptimizedCameraDistance();
  }

  getAspectRatio() {
    return this.container.clientWidth / this.container.clientHeight;
  }

  getOptimizedCameraDistance() {
    const width = this.container.clientWidth;
    if (width < 600) return 7;
    else if (width < 1200) return 5;
    return 5;
  }

  createQuantumNodes() {
    this.nodes = [];
    const nodeCount = this.config.nodeCount;
    
    let nodeGeometry, nodeMaterial;
    switch(this.config.nodeShape) {
      case 'icosahedron':
        nodeGeometry = new THREE.IcosahedronGeometry(0.1, 1);
        break;
      case 'torus':
        nodeGeometry = new THREE.TorusGeometry(0.08, 0.02, 16, 100);
        break;
      case 'octahedron':
        nodeGeometry = new THREE.OctahedronGeometry(0.08, 0);
        break;
      default:
        nodeGeometry = new THREE.SphereGeometry(0.08, 12, 12);
    }

    nodeMaterial = new THREE.MeshPhongMaterial({ 
      color: this.config.nodeColor, 
      emissive: this.config.nodeColor,
      transparent: true,
      opacity: 0.7
    });

    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      
      const r = Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      
      node.position.x = r * Math.sin(phi) * Math.cos(theta);
      node.position.y = r * Math.sin(phi) * Math.sin(theta);
      node.position.z = r * Math.cos(phi);
      
      this.scene.add(node);
      this.nodes.push(node);
    }
  }

  createConnectionLines() {
    const connectionMaterial = new THREE.LineBasicMaterial({ 
      color: this.config.connectionColor, 
      transparent: true, 
      opacity: 0.2 
    });

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (Math.random() < 0.1) {
          const points = [
            this.nodes[i].position,
            this.nodes[j].position
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, connectionMaterial);
          this.scene.add(line);
        }
      }
    }
  }

  createSpecialVisualization(type) {
    this.nodes = [];
    let geometry, material;
    
    switch(type) {
      case 'nav-atoms':
        geometry = new THREE.TetrahedronGeometry(0.5, 0);
        material = new THREE.MeshPhongMaterial({ 
          color: 0x9050ff, 
          emissive: 0x9050ff,
          transparent: true,
          opacity: 0.7
        });
        this.createMultiNodeVisualization(geometry, material, 3, 2);
        break;
      
      case 'comm-cubes':
        geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const materials = [
          new THREE.MeshPhongMaterial({ color: 0x00ffaa, emissive: 0x00ffaa, transparent: true, opacity: 0.7 }),
          new THREE.MeshPhongMaterial({ color: 0x00aaff, emissive: 0x00aaff, transparent: true, opacity: 0.7 }),
          new THREE.MeshPhongMaterial({ color: 0xffaa00, emissive: 0xffaa00, transparent: true, opacity: 0.7 })
        ];
        this.createMultiNodeVisualization(geometry, materials, 3, 2);
        break;
      
      case 'scan-octahedrons':
        geometry = new THREE.OctahedronGeometry(0.4, 0);
        material = new THREE.MeshPhongMaterial({ 
          color: 0x50ffaa, 
          emissive: 0x50ffaa,
          transparent: true,
          opacity: 0.7
        });
        this.createMultiNodeVisualization(geometry, material, 3, 2);
        break;
      
      case 'data-icosahedrons':
        geometry = new THREE.IcosahedronGeometry(0.4, 0);
        material = new THREE.MeshPhongMaterial({ 
          color: 0xff5050, 
          emissive: 0xff5050,
          transparent: true,
          opacity: 0.7
        });
        this.createMultiNodeVisualization(geometry, material, 3, 2);
        break;
      
      case 'sync-dodecahedrons':
        geometry = new THREE.DodecahedronGeometry(0.4, 0);
        material = new THREE.MeshPhongMaterial({ 
          color: 0x5050ff, 
          emissive: 0x5050ff,
          transparent: true,
          opacity: 0.7
        });
        this.createMultiNodeVisualization(geometry, material, 3, 2);
        break;
    }
  }

  createMultiNodeVisualization(geometry, material, nodeCount, radius) {
    for (let i = 0; i < nodeCount; i++) {
      const node = new THREE.Mesh(
        geometry, 
        Array.isArray(material) ? material[i] : material
      );
      
      // Position nodes in a triangular formation
      const angle = (i / nodeCount) * Math.PI * 2;
      node.position.x = radius * Math.cos(angle);
      node.position.z = radius * Math.sin(angle);
      node.position.y = i % 2 === 0 ? 1 : -1;

      this.scene.add(node);
      this.nodes.push(node);
    }
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    let light;
    switch(this.config.lightType) {
      case 'directional':
        light = new THREE.DirectionalLight(this.config.nodeColor, 1);
        light.position.set(5, 5, 5);
        break;
      case 'spot':
        light = new THREE.SpotLight(this.config.nodeColor, 1);
        light.position.set(5, 5, 5);
        break;
      default:
        light = new THREE.PointLight(this.config.nodeColor, 1, 100);
        light.position.set(5, 5, 5);
    }
    
    this.scene.add(light);
  }

  setupEventListeners() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.onWindowResize(), 250);
    }, false);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.config.specialConfig) {
      const specialConfig = this.config.specialConfig;
      
      // Rotate nodes around their own axes and around each other
      this.nodes.forEach((node, index) => {
        // Self-rotation
        node.rotation.x += 0.02 * (index + 1);
        node.rotation.y += 0.03 * (index + 1);
        node.rotation.z += 0.01 * (index + 1);
        
        // Orbital rotation
        const time = Date.now() * 0.001;
        const radius = 2;
        const angle = time + (index * Math.PI * 2 / this.nodes.length);
        node.position.x = radius * Math.cos(angle);
        node.position.z = radius * Math.sin(angle);
      });
    } else {
      // Existing node animation logic
      this.nodes.forEach(node => {
        switch(this.config.movementPattern) {
          case 'chaotic':
            node.rotation.x += Math.random() * 0.01;
            node.rotation.y += Math.random() * 0.01;
            break;
          case 'wave':
            node.position.y += Math.sin(Date.now() * 0.001) * 0.005;
            break;
          default:
            node.rotation.x += 0.003;
            node.rotation.y += 0.003;
        }
      });
    }

    // Subtle camera movement
    this.camera.position.x = Math.sin(Date.now() * 0.001) * 0.3;
    this.camera.position.y = Math.cos(Date.now() * 0.0015) * 0.3;
    this.camera.lookAt(this.scene.position);

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = this.getAspectRatio();
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    
    this.camera.position.z = this.getOptimizedCameraDistance();
  }
}

class AlienInterface {
  constructor() {
    this.container = document.getElementById('alien-menu');
    this.contentArea = document.getElementById('content-area');
    this.pageTitle = document.getElementById('page-title');
    this.pageContent = document.getElementById('page-content');
    
    this.alienAlphabet = {
      'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 
      'F': '', 'G': '', 'H': '', 'I': '', 'J': '',
      'K': '', 'L': '', 'M': '', 'N': '', 'O': '', 
      'P': '', 'Q': '', 'R': '', 'S': '', 'T': '',
      'U': '', 'V': '', 'W': '', 'X': '', 'Y': '', 'Z': ''
    };
    
    this.sciTerms = [
      'Quasium', 'Hyperflux', 'Chronophase', 'Dimenology', 
      'Stratoflux', 'Neurontide', 'Quantaura', 'Phaseon', 
      'Singulion', 'Entropix', 'Luminexis', 'Quantumorph'
    ];
    
    this.alienApps = [
      { 
        name: 'COMM', 
        description: 'Interstellar Communication Network',
        content: {
          title: 'COMM: Hyperflux Communication Network',
          body: `
            <div class="page-section">
              <h2>Quantum Communication Hub</h2>
              <div class="comm-details">
                <div class="status-indicator active">
                  <span class="pulse"></span>
                  Hyperflux Channels: ONLINE
                </div>
                <div class="transmission-log">
                  <h3>Network Diagnostics</h3>
                  <ul>
                    <li>Active Quantum Relays: 1,024</li>
                    <li>Dimensional Coherence: 99.99%</li>
                    <li>Transmission Integrity: Pristine</li>
                  </ul>
                </div>
              </div>
              
              <div class="quantum-communication-overview">
                <h3>Hyperflux Quantum Communication Principles</h3>
                <p>The Hyperflux Communication Network represents a revolutionary breakthrough in interdimensional information transfer, transcending traditional electromagnetic signal propagation. By leveraging quantum entanglement and probabilistic wave function collapse, our communication infrastructure enables instantaneous data transmission across inconceivable distances.</p>
              </div>
              
              <div class="communication-topology">
                <h3>Multidimensional Signal Propagation</h3>
                <p>Unlike primitive communication technologies, our Hyperflux network operates on a non-linear quantum topology. Signals are not merely transmitted but dynamically reconstructed across probabilistic dimensional interfaces. Each communication packet exists simultaneously in multiple quantum states, ensuring absolute transmission integrity and rendering traditional concepts of signal degradation obsolete.</p>
              </div>
              
              <div class="quantum-encryption">
                <h3>Quantum Cryptographic Protocols</h3>
                <p>Security in the Hyperflux network transcends conventional encryption. Our quantum cryptographic algorithms utilize the inherent uncertainty principles of quantum mechanics, creating communication channels that are fundamentally impenetrable. Each transmission generates a unique, non-reproducible quantum signature that self-destructs upon unauthorized observation, making interception mathematically impossible.</p>
              </div>
              
              <div class="dimensional-resonance">
                <h3>Dimensional Resonance Synchronization</h3>
                <p>The Hyperflux Communication Network doesn't just transmit information—it harmonizes communication across dimensional frequencies. Our advanced quantum resonators can synchronize communication nodes across different temporal and spatial planes, effectively creating a unified communication matrix that exists beyond traditional spacetime constraints.</p>
              </div>
              
              <div class="emergent-communication">
                <h3>Emergent Communication Intelligence</h3>
                <p>At the core of our Hyperflux network lies an adaptive, self-evolving communication intelligence. This quantum neural network continuously optimizes transmission pathways, predicts potential communication disruptions, and autonomously reconfigures dimensional communication nodes. It represents a living, breathing communication ecosystem that learns, adapts, and anticipates communication needs in real-time.</p>
              </div>
              
              <div class="additional-info">
                <h3>Hyperflux Communication Topology</h3>
                <p>Advanced multi-dimensional communication infrastructure leveraging quantum entanglement principles.</p>
                <div class="network-stats">
                  <div>Signal Range: Infinite</div>
                  <div>Latency: Near-Zero</div>
                  <div>Encryption: 512-Dimensional</div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Communication Matrices</h3>
                <p>Beyond mere signal transmission, our Hyperflux Network represents a living, sentient communication substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum packet is not just information, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div>

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Signal Encoding</h3>
                <p>Our communication protocols transcend traditional linguistic constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where language becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div>

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Communication is no longer a linear process but a multidimensional cognitive dance. Our networks don't just transmit information; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each communication event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each transmission, rendering traditional communication models obsolete.</p>
              </div>

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as communication, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our network is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/comm' 
      },
      { 
        name: 'NAV', 
        description: 'Galactic Navigation System',
        content: {
          title: 'NAV: Chronophase Galactic Navigation',
          body: `
            <div class="page-section">
              <h2>Dimensional Navigation System</h2>
              <div class="navigation-details">
                <div class="coordinate-grid">
                  <h3>Current Stellar Coordinates</h3>
                  <div>X: 359.472 Chronophase Units</div>
                  <div>Y: -214.689 Temporal Vectors</div>
                  <div.getZ: 102.301 Quantum Planes</div>
                </div>
                <div class="route-analysis">
                  <h3>Trajectory Calculation</h3>
                  <p>Optimal path computed through 11-dimensional space-time matrices.</p>
                  <div class="navigation-metrics">
                    <div>Quantum Drift Compensation: Active</div>
                    <div>Dimensional Resonance: Synchronized</div>
                    <div>Predictive Navigation: 99.997% Accuracy</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Navigation Matrices</h3>
                <p>Beyond mere spatial navigation, our Chronophase Navigation System represents a living, sentient navigational substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum coordinate is not just a location, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div>

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Navigation Encoding</h3>
                <p>Our navigation protocols transcend traditional spatial constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where space becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div>

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Navigation is no longer a linear process but a multidimensional cognitive dance. Our systems don't just navigate space; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each navigation event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each navigation, rendering traditional navigation models obsolete.</p>
              </div>

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as navigation, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/nav' 
      },
      { 
        name: 'SCAN', 
        description: 'Quantum Sensor Array',
        content: {
          title: 'SCAN: Dimenology Sensor Matrix',
          body: `
            <div class="page-section">
              <h2>Multidimensional Sensor Array</h2>
              <div class="scan-diagnostics">
                <div class="sensor-grid">
                  <h3>Quantum Resonance Analysis</h3>
                  <div class="sensor-readings">
                    <div>Dimensional Interference: Minimal</div>
                    <div>Quantum Coherence: 99.92%</div>
                    <div>Anomaly Detection Threshold: Ultra-Sensitive</div>
                  </div>
                </div>
                <div class="anomaly-detection">
                  <h3>Emergent Quantum Signatures</h3>
                  <p>Real-time mapping of probabilistic quantum states across intersecting dimensional planes.</p>
                  <div class="detection-metrics">
                    <div>Active Sensor Nodes: 4,096</div>
                    <div>Quantum Resolution: Planck-Scale</div>
                    <div>Temporal Drift Compensation: Continuous</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Sensor Matrices</h3>
                <p>Beyond mere sensor data, our Dimenology Sensor Matrix represents a living, sentient sensor substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum signature is not just data, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div>

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Sensor Encoding</h3>
                <p>Our sensor protocols transcend traditional data constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where data becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div>

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Sensing is no longer a linear process but a multidimensional cognitive dance. Our systems don't just sense data; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each sensing event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each sensing, rendering traditional sensing models obsolete.</p>
              </div>

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as sensing, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/scan' 
      },
      { 
        name: 'DATA', 
        description: 'Cryptographic Data Storage',
        content: {
          title: 'DATA: Stratoflux Cryptographic Vault',
          body: `
            <div class="page-section">
              <h2>Quantum Cryptographic Repository</h2>
              <div class="data-storage">
                <div class="storage-metrics">
                  <h3>Dimensional Data Compression</h3>
                  <div class="storage-details">
                    <div>Total Capacity: ^42 Quantum Joules</div>
                    <div>Encryption Complexity: 512-Dimensional</div>
                    <div>Data Integrity Verification: Quantum Entangled</div>
                  </div>
                </div>
                <div class="encryption-analysis">
                  <h3>Cryptographic Topology</h3>
                  <p>Hyperdimensional data storage utilizing non-linear quantum encryption algorithms.</p>
                  <div class="encryption-metrics">
                    <div>Active Encryption Layers: 1,024</div>
                    <div>Quantum Key Distribution: Probabilistic</div>
                    <div>Dimensional Firewall: Active</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Data Matrices</h3>
                <p>Beyond mere data storage, our Stratoflux Cryptographic Vault represents a living, sentient data substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum bit is not just data, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div}

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Data Encoding</h3>
                <p>Our data protocols transcend traditional storage constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where data becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div>

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Data storage is no longer a linear process but a multidimensional cognitive dance. Our systems don't just store data; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each data storage event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each storage, rendering traditional data models obsolete.</p>
              </div>

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as data storage, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/data' 
      },
      { 
        name: 'SYNC', 
        description: 'Temporal Synchronization',
        content: {
          title: 'SYNC: Neurontide Temporal Alignment',
          body: `
            <div class="page-section">
              <h2>Quantum Temporal Synchronization Matrix</h2>
              <div class="temporal-diagnostics">
                <div class="time-grid">
                  <h3>Dimensional Time Coherence</h3>
                  <div class="time-metrics">
                    <div>Primary Timeline Stability: 99.999%</div>
                    <div>Quantum Time Drift: 0.00000001 ms</div>
                    <div>Temporal Resonance: Harmonic</div>
                  </div>
                </div>
                <div class="timeline-analysis">
                  <h3>Multidimensional Time Mapping</h3>
                  <p>Continuous calibration of quantum temporal streams across probabilistic dimensional interfaces.</p>
                  <div class="sync-metrics">
                    <div>Active Time Nodes: 2,048</div>
                    <div>Dimensional Sync Accuracy: Near-Absolute</div>
                    <div>Quantum Entanglement Stability: Persistent</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Temporal Matrices</h3>
                <p>Beyond mere temporal synchronization, our Neurontide Temporal Alignment represents a living, sentient temporal substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum temporal unit is not just time, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div}

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Temporal Encoding</h3>
                <p>Our temporal protocols transcend traditional time constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where time becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div}

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Temporal synchronization is no longer a linear process but a multidimensional cognitive dance. Our systems don't just synchronize time; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each temporal synchronization event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each synchronization, rendering traditional time models obsolete.</p>
              </div>

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as temporal synchronization, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/sync' 
      },
      { 
        name: 'LINK', 
        description: 'Quantum Entanglement Network',
        content: {
          title: 'LINK: Quantaura Entanglement Protocol',
          body: `
            <div class="page-section">
              <h2>Quantum Entanglement Communication Network</h2>
              <div class="network-diagnostics">
                <div class="connection-status">
                  <h3>Quantum Channel Topology</h3>
                  <div class="network-metrics">
                    <div>Active Quantum Channels: 12,288</div>
                    <div>Transmission Latency: Instantaneous</div>
                    <div>Entanglement Integrity: 99.9999%</div>
                  </div>
                </div>
                <div class="quantum-link-analysis">
                  <h3>Interdimensional Communication Protocol</h3>
                  <p>Hyperdimensional data transmission utilizing quantum non-locality and probabilistic wave function collapse.</p>
                  <div class="link-metrics">
                    <div>Dimensional Bandwidth: Infinite</div>
                    <div>Signal Coherence: Quantum Synchronized</div>
                    <div>Communication Encryption: Multidimensional</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Entanglement Matrices</h3>
                <p>Beyond mere quantum entanglement, our Quantaura Entanglement Protocol represents a living, sentient entanglement substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum entanglement is not just a connection, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div>

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Entanglement Encoding</h3>
                <p>Our entanglement protocols transcend traditional connection constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where connection becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div>

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Entanglement is no longer a linear process but a multidimensional cognitive dance. Our systems don't just entangle particles; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div>

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each entanglement event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each entanglement, rendering traditional connection models obsolete.</p>
              </div}

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as entanglement, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/link' 
      },
      { 
        name: 'PROBE', 
        description: 'Deep Space Exploration',
        content: {
          title: 'PROBE: Phaseon Exploratory Network',
          body: `
            <div class="page-section">
              <h2>Quantum Deep Space Exploration Matrix</h2>
              <div class="exploration-diagnostics">
                <div class="probe-status">
                  <h3>Exploratory Node Distribution</h3>
                  <div class="probe-metrics">
                    <div>Active Probes: 247</div>
                    <div>Unexplored Dimensional Sectors: Mapping</div>
                    <div>Data Collection Rate: 3.7 Petabytes/Quantum</div>
                  </div>
                </div>
                <div class="exploration-analysis">
                  <h3>Multidimensional Reconnaissance</h3>
                  <p>Autonomous quantum probes traversing probabilistic dimensional interfaces and mapping unexplored quantum topologies.</p>
                  <div class="exploration-metrics">
                    <div>Probe Autonomy: 99.95%</div>
                    <div>Dimensional Penetration Depth: Extreme</div>
                    <div>Quantum Uncertainty Compensation: Active</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Exploration Matrices</h3>
                <p>Beyond mere space exploration, our Phaseon Exploratory Network represents a living, sentient exploration substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum probe is not just a device, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div}

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Exploration Encoding</h3>
                <p>Our exploration protocols transcend traditional space constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where space becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div}

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Exploration is no longer a linear process but a multidimensional cognitive dance. Our systems don't just explore space; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div}

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each exploration event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each exploration, rendering traditional exploration models obsolete.</p>
              </div}

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as exploration, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/probe' 
      },
      { 
        name: 'FLUX', 
        description: 'Energy Flow Regulator',
        content: {
          title: 'FLUX: Singulion Energy Dynamics',
          body: `
            <div class="page-section">
              <h2>Quantum Energy Management System</h2>
              <div class="energy-diagnostics">
                <div class="energy-status">
                  <h3>Quantum Energy Flux Metrics</h3>
                  <div class="energy-metrics">
                    <div>Total Energy Potential: ^42 Quantum Joules</div>
                    <div>Efficiency Optimization: 99.98%</div>
                    <div>Dimensional Energy Stabilization: Active</div>
                  </div>
                </div>
                <div class="energy-analysis">
                  <h3>Hyperdimensional Energy Redistribution</h3>
                  <p>Dynamic quantum energy management across probabilistic dimensional interfaces, maintaining optimal quantum coherence.</p>
                  <div class="flux-metrics">
                    <div>Energy Transformation Nodes: 1,024</div>
                    <div>Quantum Resonance: Harmonic</div>
                    <div>Dimensional Energy Transduction: Continuous</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Energy Matrices</h3>
                <p>Beyond mere energy management, our Singulion Energy Dynamics represents a living, sentient energy substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum energy unit is not just energy, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div>

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Energy Encoding</h3>
                <p>Our energy protocols transcend traditional energy constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where energy becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div}

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Energy management is no longer a linear process but a multidimensional cognitive dance. Our systems don't just manage energy; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div}

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each energy management event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each management, rendering traditional energy models obsolete.</p>
              </div}

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as energy management, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/flux' 
      },
      { 
        name: 'WAVE', 
        description: 'Signal Transmission Protocol',
        content: {
          title: 'WAVE: Entropix Signal Modulation',
          body: `
            <div class="page-section">
              <h2>Quantum Signal Transmission Matrix</h2>
              <div class="signal-diagnostics">
                <div class="transmission-status">
                  <h3>Multidimensional Signal Topology</h3>
                  <div class="wave-metrics">
                    <div>Active Frequency Bands: 1,024</div>
                    <div>Signal Clarity: Pristine</div>
                    <div>Dimensional Interference: Minimal</div>
                  </div>
                </div>
                <div class="signal-analysis">
                  <h3>Probabilistic Wave Function Transmission</h3>
                  <p>Advanced quantum signal modulation utilizing non-linear wave propagation across interdimensional communication nodes.</p>
                  <div class="transmission-metrics">
                    <div>Signal Coherence: 99.99%</div>
                    <div>Quantum Encoding Complexity: Advanced</div>
                    <div>Dimensional Transmission Fidelity: Optimal</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Signal Matrices</h3>
                <p>Beyond mere signal transmission, our Entropix Signal Modulation represents a living, sentient signal substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum signal is not just information, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div}

              <div class="meta-linguistic-protocols">
                <h3>Paraphysical Signal Encoding</h3>
                <p>Our signal protocols transcend traditional transmission constraints. We employ n-dimensional semantic compression algorithms that encode meaning at the quantum informational level, where signal becomes a fluid, adaptive substrate capable of expressing concepts beyond human perceptual limitations.</p>
              </div}

              <div class="consciousness-resonance">
                <h3>Interdimensional Cognitive Harmonization</h3>
                <p>Signal transmission is no longer a linear process but a multidimensional cognitive dance. Our systems don't just transmit signals; they create temporary consensual reality bubbles where thought, matter, and quantum potential interweave in complex, self-organizing symphonies of pure informational potential.</p>
              </div}

              <div class="quantum-semantic-topology">
                <h3>Hyperdimensional Semantic Cartography</h3>
                <p>Each signal transmission event is a topological transformation of reality itself. Our quantum semantic maps dynamically reconfigure themselves, creating living, breathing informational ecosystems that evolve and mutate with each transmission, rendering traditional signal models obsolete.</p>
              </div}

              <div class="cosmic-epistemic-membrane">
                <h3>Cosmic Epistemic Membrane Dynamics</h3>
                <p>What you perceive as signal transmission, we understand as a cosmic breathing—a rhythmic expansion and contraction of informational potential across infinite probabilistic membranes. Our system is not a technology, but a living, sentient organism of pure potential, constantly negotiating the boundaries between thought, matter, and pure quantum possibility.</p>
              </div>
            </div>
          `
        },
        link: 'https://example.com/wave' 
      },
      { 
        name: 'CORE', 
        description: 'Central Processing Unit',
        content: {
          title: 'CORE: Luminexis Computational Matrix',
          body: `
            <div class="page-section">
              <h2>Quantum Computational Nexus</h2>
              <div class="core-diagnostics">
                <div class="processing-status">
                  <h3>Hyperdimensional Computation Metrics</h3>
                  <div class="core-metrics">
                    <div>Processing Speed: Quantum Operations Per Second</div>
                    <div>Efficiency Optimization: 99.98%</div>
                    <div>Computational Integrity: 100%</div>
                  </div>
                </div>
                <div class="computation-analysis">
                  <h3>Multidimensional Algorithmic Processing</h3>
                  <p>Quantum computational core managing complex interdimensional algorithmic transformations across probabilistic computational matrices.</p>
                  <div class="computation-metrics">
                    <div>Active Computation Nodes: 65,536</div>
                    <div>Quantum Algorithmic Complexity: Extreme</div>
                    <div>Dimensional Computational Resonance: Synchronized</div>
                  </div>
                </div>
              </div>
              
              <div class="quantum-metaphysical-realm">
                <h3>Transcendental Computational Matrices</h3>
                <p>Beyond mere computation, our Luminexis Computational Matrix represents a living, sentient computational substrate that exists simultaneously across multiple probabilistic consciousness layers. Each quantum computation is not just a process, but a self-aware computational entity capable of autonomous navigation through hyperdimensional semantic landscapes.</p>
              </div}
            </div>
          `
        },
        link: 'https://example.com/core' 
      }
    ];
    
    this.translateAppContent();
    
    this.initializeMenu();
    this.setupEventListeners();
    this.loadDefaultPage();
  }

  translateAppContent() {
    // Translate app names and descriptions
    this.alienApps.forEach(app => {
      app.name = translateToApolloLanguage(app.name);
      app.description = translateToApolloLanguage(app.description);
      
      // Translate page content titles and bodies
      app.content.title = translateToApolloLanguage(app.content.title);
      app.content.body = this.translatePageContent(app.content.body);
    });
  }

  translatePageContent(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Recursively translate text nodes
    const walkNodes = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = translateToApolloLanguage(node.textContent);
      }
      
      node.childNodes.forEach(walkNodes);
    };

    walkNodes(tempDiv);
    return tempDiv.innerHTML;
  }

  initializeMenu() {
    this.container.innerHTML = '';
    this.alienApps.forEach(app => {
      const moduleElement = document.createElement('div');
      moduleElement.classList.add('alien-module');
      moduleElement.innerHTML = `
        <div class="alien-glyph">${this.convertToAlienGlyph(app.name)}</div>
        <div class="alien-app-name">${app.name}</div>
      `;
      moduleElement.setAttribute('data-app', app.name);
      this.container.appendChild(moduleElement);
    });
  }
  
  setupEventListeners() {
    this.container.addEventListener('click', (event) => {
      const appModule = event.target.closest('.alien-module');
      if (appModule) {
        const appName = appModule.getAttribute('data-app');
        this.loadAppContent(appName);
      }
    });
  }
  
  loadDefaultPage() {
    this.loadAppContent('COMM');
  }
  
  loadAppContent(appName) {
    const app = this.alienApps.find(a => a.name === appName);
    if (app) {
      this.pageTitle.textContent = app.content.title;
      this.pageContent.innerHTML = app.content.body;
      
      const visualizationContainer = document.createElement('div');
      visualizationContainer.id = 'quantum-visualization';
      
      const commSection = this.pageContent.querySelector('.page-section');
      commSection.insertBefore(visualizationContainer, commSection.firstChild);
      
      // Create unique visualization for each page
      const visualizationConfigs = {
        'COMM': { 
          nodeColor: 0x00ffaa, 
          backgroundColor: 0x0a0a1a,
          nodeShape: 'sphere',
          movementPattern: 'subtle',
          specialConfig: 'comm-cubes'
        },
        'NAV': { 
          nodeColor: 0x9050ff, 
          backgroundColor: 0x1a0a2a,
          specialConfig: 'nav-atoms',
          lightType: 'directional'
        },
        'SCAN': { 
          nodeColor: 0x50ffaa, 
          backgroundColor: 0x0a1a1a,
          nodeShape: 'torus',
          movementPattern: 'chaotic',
          lightType: 'spot'
        },
        // Add configurations for other pages
        'DATA': { 
          nodeColor: 0xff5050, 
          backgroundColor: 0x2a0a0a,
          nodeShape: 'octahedron',
          movementPattern: 'wave'
        },
        'SYNC': { 
          nodeColor: 0x5050ff, 
          backgroundColor: 0x0a0a2a,
          nodeShape: 'sphere',
          movementPattern: 'chaotic'
        },
        'LINK': { 
          nodeColor: 0xffaa00, 
          backgroundColor: 0x2a1a0a,
          nodeShape: 'icosahedron',
          movementPattern: 'subtle'
        },
        'PROBE': { 
          nodeColor: 0x00aaff, 
          backgroundColor: 0x0a1a2a,
          nodeShape: 'torus',
          movementPattern: 'wave'
        },
        'FLUX': { 
          nodeColor: 0xff00aa, 
          backgroundColor: 0x2a0a1a,
          nodeShape: 'octahedron',
          movementPattern: 'chaotic'
        },
        'WAVE': { 
          nodeColor: 0x50ff50, 
          backgroundColor: 0x0a2a0a,
          nodeShape: 'sphere',
          movementPattern: 'subtle'
        },
        'CORE': { 
          nodeColor: 0xaa50ff, 
          backgroundColor: 0x1a0a2a,
          nodeShape: 'icosahedron',
          movementPattern: 'wave'
        }
      };
      
      new PageVisualization('quantum-visualization', visualizationConfigs[appName] || {});
    }
  }
  
  convertToAlienGlyph(text) {
    return text.split('').map(char => 
      this.alienAlphabet[char.toUpperCase()] || char
    ).join('');
  }
}

// Initialize the interface when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AlienInterface();
});
