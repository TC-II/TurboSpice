// Reloj (#366): una onda cuadrada de PERIOD ns (1000: 1 MHz) que arranca en 0. Es de comportamiento
// (un retardo #): corre adentro del módulo único de Icarus, así el reloj no pasa por lo analógico
// (ni una fuente de pulsos ni sus puentes). No se puede sintetizar: con hdl=gates, una fuente PULSE.
`timescale 1ns/1ps
module dsp_clock #(parameter PERIOD = 1000) (
  output reg clk
);
  initial clk = 0;
  always #(PERIOD / 2.0) clk = ~clk;
endmodule
