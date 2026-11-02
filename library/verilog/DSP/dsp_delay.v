// Retardo z⁻¹ (#366): registro de W bits en el flanco de subida; arranca en 0.
module dsp_delay #(parameter W = 16) (
  input clk,
  input signed [W-1:0] d,
  output reg signed [W-1:0] q
);
  initial q = 0;
  always @(posedge clk) q <= d;
endmodule
