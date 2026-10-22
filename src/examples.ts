// Netlists de ejemplo del modo netlist (los nombres se traducen al mostrarlos)
export const EXAMPLES: Record<string, string> = {
  'RC transient': `* RC filter: step response
V1 in 0 PULSE(0 1 0 1u 1u 5m 10m) AC 1
R1 in out 1k
C1 out 0 1u
.tran 10u 20m
.end`,
  'AC (Bode) RLC': `* 2nd-order RLC low-pass
V1 in 0 AC 1
R1 in a 10
L1 a out 1m
C1 out 0 1u
.ac dec 100 100 100k
.end`,
  'DC: BJT curves': `* Ic-Vce curves of an NPN
Vce c 0 0
Ib 0 b 10u
Q1 c b 0 qn
.model qn NPN(BF=150 IS=1e-14 VAF=80)
.dc Vce 0 10 0.05 Ib 10u 50u 10u
.end`,
  'Noise': `* Output noise of a divider
V1 in 0 DC 0 AC 1
R1 in out 10k
R2 out 0 10k
C1 out 0 1n
.noise v(out) V1 dec 20 10 10meg
.end`,
  'Poles and zeros': `* Poles and zeros of an RLC
V1 in 0 AC 1
R1 in a 10
L1 a out 1m
C1 out 0 1u
.pz in 0 out 0 vol pz
.end`,
  'XSPICE digital': `* 2-bit counter with D flip-flops (XSPICE)
Vclk clk 0 PULSE(0 1 0 1n 1n 0.5u 1u)
Aadc [clk] [dclk] adc1
Ainv1 q0 nq0 inv1
Ainv2 q1 nq1 inv1
Aff0 nq0 dclk nul nul q0 qb0 dff1
Aff1 nq1 q0 nul nul q1 qb1 dff1
Adac [q0 q1] [a0 a1] dac1
R0 a0 0 1k
R1 a1 0 1k
.model adc1 adc_bridge(in_low=0.3 in_high=0.7)
.model dac1 dac_bridge(out_low=0 out_high=1)
.model inv1 d_inverter
.model dff1 d_dff
.tran 10n 8u
.end`,
  '.control script': `* Sweeping R with a .control loop
V1 in 0 PULSE(0 1 0 1u 1u 5m 10m)
R1 in out 1k
C1 out 0 1u
.control
foreach r 500 1k 2k
  alter R1 $r
  tran 10u 6m
end
.endc
.end`,
};
