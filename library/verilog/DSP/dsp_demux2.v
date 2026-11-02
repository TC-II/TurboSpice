// Demultiplexor 1 → 2 (#366): x va a a con sel = 0 y a b con sel = 1; la otra salida queda en 0.
module dsp_demux2 #(parameter W = 16) (
  input [W-1:0] x,
  input sel,
  output [W-1:0] a,
  output [W-1:0] b
);
  assign a = sel ? 0 : x;
  assign b = sel ? x : 0;
endmodule
