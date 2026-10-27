// Downsampler (decimation filter) of the sigma-delta ADC: it counts the ones of the 1-bit stream y
// and, every 64 clock cycles, puts the count on value (0…64 ≈ Vin/Vcc·64): a sinc (moving sum)
// filter followed by taking one sample out of 64.
module DOWNSAMPLER (
  input clk,
  input y,
  output reg [6:0] value
);
  reg [5:0] cnt = 0;
  reg [6:0] acc = 0;
  initial value = 0;
  always @(posedge clk) begin
    cnt <= cnt + 1;
    if (cnt == 63) begin
      value <= acc + y;
      acc <= 0;
    end else
      acc <= acc + y;
  end
endmodule
