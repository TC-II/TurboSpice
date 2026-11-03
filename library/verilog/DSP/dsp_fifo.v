// FIFO de 16 palabras (#366): con wr = 1 guarda d en el flanco (si no está llena), con rd = 1 saca la
// primera (si no está vacía); q es la primera, sin esperar un ciclo. Arranca vacía.
module dsp_fifo #(parameter W = 16) (
  input clk,
  input wr,
  input rd,
  input [W-1:0] d,
  output [W-1:0] q,
  output empty,
  output full
);
  reg [W-1:0] mem [0:15];
  reg [3:0] wp, rp;
  reg [4:0] count;
  integer k;
  initial begin
    for (k = 0; k < 16; k = k + 1) mem[k] = 0;
    wp = 0;
    rp = 0;
    count = 0;
  end
  wire w = wr && count != 16;
  wire r = rd && count != 0;
  always @(posedge clk) begin
    if (w) begin
      mem[wp] <= d;
      wp <= wp + 1;
    end
    if (r) rp <= rp + 1;
    count <= count + w - r;
  end
  assign q = mem[rp];
  assign empty = count == 0;
  assign full = count == 16;
endmodule
