// FIR de 8 taps (#366) en un solo bloque: y = Σ C_k·x[n−k] con F bits fraccionarios en los
// coeficientes (por omisión, el pasabajos de 100 kHz a 1 MHz del ejemplo DSP), acumulado con todos
// los bits, redondeado y saturado. La línea de retardos avanza con clk; la salida es combinacional.
module dsp_fir8 #(parameter W = 16, parameter F = 15, parameter C0 = 287, parameter C1 = 1571, parameter C2 = 5375, parameter C3 = 9151, parameter C4 = 9151, parameter C5 = 5375, parameter C6 = 1571, parameter C7 = 287) (
  input clk,
  input signed [W-1:0] x,
  output signed [W-1:0] y
);
  localparam signed [W-1:0] MAX = {1'b0, {(W-1){1'b1}}};
  localparam signed [W-1:0] MIN = {1'b1, {(W-1){1'b0}}};
  reg signed [W-1:0] d1, d2, d3, d4, d5, d6, d7;
  initial {d1, d2, d3, d4, d5, d6, d7} = 0;
  always @(posedge clk) {d1, d2, d3, d4, d5, d6, d7} <= {x, d1, d2, d3, d4, d5, d6};
  localparam signed [W-1:0] K0 = C0, K1 = C1, K2 = C2, K3 = C3, K4 = C4, K5 = C5, K6 = C6, K7 = C7;
  wire signed [2*W+2:0] s = x * K0 + d1 * K1 + d2 * K2 + d3 * K3 + d4 * K4 + d5 * K5 + d6 * K6 + d7 * K7 + (F > 0 ? 1 << (F - 1) : 0);
  wire signed [2*W+2:0] q = s >>> F;
  wire ovf = q[2*W+2:W-1] != {(W+4){q[2*W+2]}};
  assign y = ovf ? (q[2*W+2] ? MIN : MAX) : q[W-1:0];
endmodule
