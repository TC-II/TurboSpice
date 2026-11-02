// Multiplexor 2 → 1 (#366): y = a con sel = 0, b con sel = 1.
module dsp_mux2 #(parameter W = 16) (
  input [W-1:0] a,
  input [W-1:0] b,
  input sel,
  output [W-1:0] y
);
  assign y = sel ? b : a;
endmodule
