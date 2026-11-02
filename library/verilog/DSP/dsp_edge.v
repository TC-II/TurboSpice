// Detector de flancos (#366): rise (o fall) vale 1 durante el ciclo de reloj siguiente a un flanco
// de subida (o de bajada) de d, que se muestrea con clk.
module dsp_edge (
  input clk,
  input d,
  output rise,
  output fall
);
  reg d1, d2;
  initial d1 = 0;
  initial d2 = 0;
  always @(posedge clk) begin
    d1 <= d;
    d2 <= d1;
  end
  assign rise = d1 & ~d2;
  assign fall = ~d1 & d2;
endmodule
