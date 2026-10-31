# Análisis de estabilidad (`.stb`)

Calcula la ganancia de lazo en un punto del lazo, con los métodos que Frank Wiedmann
implementó para SPICE (<https://sites.google.com/site/frankwiedmann/loopgain>). Cada método se
presenta con su modelo:

- **Tian** (por defecto) → **modelo A-β sin feedforward**: A (amplificador), β (realimentador),
  T = −Aβ y G = A/(1 + Aβ) = A/(1 − T). Es el mismo que `stb` de Spectre (Tian et al., «Striving
  for Small-Signal Stability», IEEE Circuits & Devices, 2001) y es simétrico: no importa la
  orientación de la sonda. Con una fuente de entrada y una salida da además G, A = G·(1 − T) y
  β = −T/A.
- **GFT** de Middlebrook («The General Feedback Theorem», IEEE Microwave Magazine, 2006) →
  **modelo de ganancia asintótica**: G = G∞·R/(1+R) + G0/(1+R), con R (razón de retorno),
  G∞ = 1/β (ganancia con R → ∞) y G0 (ganancia con R = 0). La señal del lazo tiene que entrar a
  la sonda por su flecha. Con entrada y salida da G, G∞, G0, Rn (razón de retorno nula), Rp y el
  **A-β equivalente**: β = 1/G∞, A = G∞·(G∞·R + G0)/(G∞ − G0) (sin camino directo, A = G∞·R y
  Aβ = R), con T = −Aβ.
Los dos métodos dan los mismos polos de lazo cerrado (los ceros de 1 + Aβ o de 1 + R). Difieren cuando hay
transmisión en reversa en el corte: Tian la suma al lazo y el GFT la toma como carga.

## Sondas

En la librería **Stability**:

- `LoopProbe`: en serie en el lazo. Adentro tiene `Vinj` (tensión en serie), `Vprb` (amperímetro) e
  `Iinj` (corriente a tierra), todas en 0. Fuera del `.stb` es un cable: no cambia `.op`, `.tran`,
  `.ac`, `.noise` ni ningún otro análisis.
- `DiffLoopProbe`: en serie en un par diferencial. Tiene dos baluns ideales espalda con espalda,
  armados con pares E + F (conservan la potencia: no aíslan ni cargan), con una `LoopProbe` en el
  modo diferencial (`xdm`) y otra en el común (`xcm`). El análisis elige el modo.
- `Balun`: el balun ideal que usa la `DiffLoopProbe`, también como componente suelto. Separa (p, n)
  en el modo diferencial d = V(p) − V(n) y el común c = (V(p) + V(n))/2, con las corrientes duales
  I(d) = (I(p) − I(n))/2 e I(c) = I(p) + I(n). Pasa continua. El proyecto de ejemplo «Loop stability»
  arma una `DiffLoopProbe` a mano con dos `Balun` y dos `LoopProbe` y da el mismo T.

Subcircuitos: `library/sub/Stability/LoopProbe.lib`.

## Sintaxis

```
.stb <sonda> [dm|cm] <dec|oct|lin> <puntos> <f inicio> <f fin> [tian|gft [<fuente> V(<salida>)]]
```

Se guarda como comentario (`;.stb …`), igual que los otros análisis que sólo tiene ngspice:
LTspice lo ignora y la sonda queda transparente.

## Cómo se simula

`tongspice.ts` lo traduce a un bloque `.control` (`netlist/stb.ts`):

1. todas las fuentes V/I del nivel superior pasan a `acmag=0`;
2. un `ac` con `Vinj` en 1, otro con `Iinj` en 1 y, con entrada y salida, otro con la entrada en 1;
3. con Vy = −V(x) e Iy = I(Vprb) (corrida 1: tensión, 2: entrada, 3: corriente):
   - D = Vy1·Iy3 − Vy3·Iy1
   - R = 1/(1/D − 1) (GFT); Aβ = 1/(Vy1 + Iy3 − 2·D) − 1 (Tian), T = −Aβ
   - num = Vo2·D + Vo1·(Vy3·Iy2 − Vy2·Iy3) + Vo3·(Vy2·Iy1 − Vy1·Iy2)
   - Tian: G = Vo2, A = G·(1 − T), β = −T/A
   - GFT: G = Vo2, G∞ = num/D, G0 = (G − G∞·D)/(1 − D), Rn = 1/(G/num − 1), Rp = 1/(G∞/G − 1),
     β = 1/G∞, A = G∞·(G∞·R + G0)/(G∞ − G0), T = −Aβ
4. los resultados quedan en un plot propio con la frecuencia como escala (`stbN`):
   - Tian: `t` (= −Aβ, el que se grafica), `ab` y, con entrada y salida, `g`, `a` y `beta`;
   - GFT: `r` (el que se grafica) y, con entrada y salida, `g`, `ginf`, `g0`, `rn`, `rp`, `a`,
     `beta`, `ab` y `t`;
   - los márgenes y los polos se calculan sobre R (GFT) o Aβ = −T (Tian). Los vectores se muestran
     en mayúsculas (`R`, `T`, `G`, `GINF`…); en las expresiones da lo mismo `R` que `r`.
   Los plots de las corridas se borran.

No se combina con un `.control` del usuario ni con `.step` (se avisa y no corre).

Las fórmulas se verificaron en ngspice: en un inversor (−R2/R1 = −10) el GFT da G∞ = −10 y el
mismo T que Tian; Tian no cambia al invertir la sonda; con la sonda diferencial el modo
diferencial da el T del medio circuito.

## Resultados

Al lado del Bode de `t` (Tian) o `r` (GFT) (`waveform/StbView.tsx`):

- márgenes (calculados sobre Aβ o R) de fase (en cada cruce de 0 dB) y de ganancia (en cada cruce de −180°);
- un modelo racional de T por *vector fitting* (`sim/stbMath.ts`) en variables de estado,
  T(s) = c·(sI − A)⁻¹·b + d. De ahí salen los polos y ceros de T (lazo abierto), los polos del
  lazo cerrado (autovalores de A − b·c/(1 + d)) y el lugar de raíces de 1 + k·T, k de 0 a ∞.

## Limitaciones

- T depende del punto de corte cuando hay lazos anidados. El margen leído en el Bode supone que
  lo que queda cerrado es estable: si T tiene polos en el semiplano derecho se avisa y hay que
  mirar los polos del lazo cerrado.
- Con el GFT, la salida no puede ser el nodo de la sonda: G∞ da 0 y Rn, Rp, A y β no tienen sentido.
  Conviene inyectar en el punto de error (la entrada del amplificador) y revisar primero G∞.
- Lazos múltiples independientes (General Network Theorem): fuera de alcance.
