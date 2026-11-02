// RAM de 16 palabras (#366), un puerto: con we = 1 escribe d en addr en el flanco; q es lo que hay en
// addr (lectura asincrónica). Arranca en 0. (Yosys la pasa a flip-flops: para memorias chicas.)
module dsp_ram #(parameter W = 16) (
  input clk,
  input we,
  input [3:0] addr,
  input [W-1:0] d,
  output [W-1:0] q
);
  reg [W-1:0] mem [0:15];
  integer k;
  initial for (k = 0; k < 16; k = k + 1) mem[k] = 0;
  always @(posedge clk) if (we) mem[addr] <= d;
  assign q = mem[addr];
endmodule
