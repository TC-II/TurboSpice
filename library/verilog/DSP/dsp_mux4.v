// Multiplexor 4 → 1 (#366): sel elige a, b, c o d.
module dsp_mux4 #(parameter W = 16) (
  input [W-1:0] a,
  input [W-1:0] b,
  input [W-1:0] c,
  input [W-1:0] d,
  input [1:0] sel,
  output [W-1:0] y
);
  assign y = sel == 0 ? a : sel == 1 ? b : sel == 2 ? c : d;
endmodule
