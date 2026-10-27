// Encoder of the 3-bit flash ADC: thermometer code -> binary.
// tk is comparator Uk: 1 when vin is above tap k of the ladder (k * Vref / 8).
// The code is the highest k with tk = 1 (a priority encoder: a stray 1 below the top does not matter).
// On each rising edge of clk the code goes to the output register d.
module FLASHENC (
  input clk,
  input t1, t2, t3, t4, t5, t6, t7,
  output reg [2:0] d
);
  wire [2:0] code = t7 ? 7 : t6 ? 6 : t5 ? 5 : t4 ? 4 : t3 ? 3 : t2 ? 2 : t1 ? 1 : 0;
  initial d = 0;
  always @(posedge clk) d <= code;
endmodule
