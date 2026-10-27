// Digital half of the first-order sigma-delta modulator (the RC integrator is in the schematic):
// the 1-bit quantizer. On each rising edge of clk it samples cmp, the integrator voltage that the
// input bridge compares with VIL/VIH (vcc/2):
//   y:  the 1-bit stream (1 when the integrator was above vcc/2), to the downsampler.
//   fb: its complement, the feedback that goes back to the integrator through a resistor.
module MODULATOR (
  input clk,
  input cmp,
  output reg y,
  output reg fb
);
  initial y = 0;
  initial fb = 1;
  always @(posedge clk) begin
    y <= cmp;
    fb <= ~cmp;
  end
endmodule
