// Sumador de 4 entradas (#366): a + b + c + d con 2 bits de más adentro y saturado al final si SAT = 1.
module dsp_sum4 #(parameter W = 16, parameter SAT = 1) (
  input signed [W-1:0] a,
  input signed [W-1:0] b,
  input signed [W-1:0] c,
  input signed [W-1:0] d,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  wire signed [W+1:0] s = a + b + c + d;
  wire ovf = s[W+1:W-1] != {3{s[W+1]}};
  assign y = SAT != 0 && ovf ? (s[W+1] ? MIN : MAX) : s[W-1:0];
endmodule
