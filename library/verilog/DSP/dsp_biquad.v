// Biquad (#366) en un solo bloque, forma directa I: y = b0·x + b1·x[n−1] + b2·x[n−2] − a1·y[n−1] −
// a2·y[n−2], con los coeficientes en Q2.14 (F = 14; por omisión, el Butterworth de 50 kHz a 1 MHz del
// ejemplo DSP). Acumula con todos los bits y satura la salida, que es un registro (cambia con clk).
module dsp_biquad #(parameter W = 16, parameter F = 14, parameter B0 = 329, parameter B1 = 658, parameter B2 = 329, parameter A1 = -25576, parameter A2 = 10508) (
  input clk,
  input signed [W-1:0] x,
  output reg signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  reg signed [W-1:0] x1, x2, y2;
  initial {x1, x2, y, y2} = 0;
  localparam signed [W:0] KB0 = B0, KB1 = B1, KB2 = B2, KA1 = A1, KA2 = A2;
  wire signed [2*W+3:0] s = x * KB0 + x1 * KB1 + x2 * KB2 - y * KA1 - y2 * KA2 + (F > 0 ? 1 << (F - 1) : 0);
  wire signed [2*W+3:0] q = s >>> F;
  wire ovf = q[2*W+3:W-1] != {(W+5){q[2*W+3]}};
  always @(posedge clk) begin
    {x1, x2} <= {x, x1};
    {y, y2} <= {ovf ? (q[2*W+3] ? MIN : MAX) : q[W-1:0], y};
  end
endmodule
