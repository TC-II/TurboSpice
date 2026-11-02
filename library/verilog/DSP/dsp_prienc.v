// Codificador de prioridad 8 → 3 (#366): idx es el bit en 1 más alto de x; valid = 0 si x = 0.
module dsp_prienc (
  input [7:0] x,
  output reg [2:0] idx,
  output valid
);
  integer k;
  always @* begin
    idx = 0;
    for (k = 0; k < 8; k = k + 1) if (x[k]) idx = k;
  end
  assign valid = |x;
endmodule
