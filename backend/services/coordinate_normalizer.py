class CoordinateNormalizer:
    @staticmethod
    def normalize(provider: str, x: float, y: float) -> tuple[float, float]:
        """
        Normalize coordinate system to StatsBomb standard:
        x: [0, 120] (horizontal length, from left to right goal)
        y: [0, 80] (vertical width, from top touchline to bottom touchline)
        """
        if x is None or y is None:
            return None, None
        
        provider = provider.lower().strip()
        
        if provider == "statsbomb":
            # Already 120 x 80
            norm_x, norm_y = x, y
        elif provider in ["opta", "whoscored", "sofascore"]:
            # Standard Opta/WhoScored is 0-100 for both x and y
            # Scale x: [0, 100] -> [0, 120]
            # Scale y: [0, 100] -> [0, 80]
            norm_x = (x / 100.0) * 120.0
            norm_y = (y / 100.0) * 80.0
        elif provider == "tracab":
            # Tracab is in cm: x in [-5250, 5250], y in [-3400, 3400]
            # Shift and scale x: [-5250, 5250] -> [0, 120]
            # Shift and scale y: [-3400, 3400] -> [0, 80]
            norm_x = ((x + 5250.0) / 10500.0) * 120.0
            norm_y = ((y + 3400.0) / 6800.0) * 80.0
        else:
            # Fallback (return unchanged)
            norm_x, norm_y = x, y
            
        # Bound coordinates to safety limits (0 to 120 for x, 0 to 80 for y)
        norm_x = max(0.0, min(120.0, norm_x))
        norm_y = max(0.0, min(80.0, norm_y))
        
        return float(norm_x), float(norm_y)
