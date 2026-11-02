// Contador (#366): cuenta en cada flanco con en = 1 (hacia abajo con down = 1), de 0 a MOD − 1 y
// vuelta; rst en 1 lo pone en 0 en el flanco. tc = 1 en el último valor de la cuenta.
module dsp_counter #(parameter W = 16, parameter MOD = 65536) (
  input clk,
  input rst,
  input en,
  input down,
  output reg [W-1:0] q,
  output tc
);
  localparam [W-1:0] LAST = MOD - 1;
  initial q = 0;
  always @(posedge clk)
    if (rst) q <= 0;
    else if (en) q <= down ? (q == 0 ? LAST : q - 1) : (q == LAST ? 0 : q + 1);
  assign tc = down ? q == 0 : q == LAST;
endmodule
