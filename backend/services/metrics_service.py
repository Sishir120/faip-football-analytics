import pandas as pd

class MetricsService:
    @staticmethod
    def calculate_ppda(events: list, pressing_team: str) -> float:
        """
        Calculate Passes Allowed per Defensive Action (PPDA) for the pressing team.
        PPDA = (Opponent Passes in Opponent's Defensive 2/3) / (Defending Team Defensive Actions in Opponent's Defensive 2/3)
        Lower values indicate higher pressing intensity.
        """
        df = pd.DataFrame(events)
        if df.empty:
            return 0.0
            
        # Determine opponent team
        teams = df['team'].dropna().unique()
        if len(teams) < 2:
            return 0.0
            
        opponent_team = [t for t in teams if t != pressing_team][0]
        
        # 1. Opponent Passes in their defensive 2/3
        # StatsBomb coordinates: team in possession attacks from x=0 to x=120.
        # Opponent's defensive 2/3 corresponds to x <= 80.
        opponent_passes = df[
            (df['team'] == opponent_team) & 
            (df['type'] == 'Pass') & 
            (df['x'] <= 80.0)
        ]
        opponent_passes_count = len(opponent_passes)
        
        # 2. Pressing team's defensive actions in opponent's defensive 2/3
        # From the perspective of the pressing team (defending), this is their attacking 2/3, i.e., x >= 40.
        # Standard defensive actions: Tackles, Interceptions, Blocks, Pressures, Challenges, Fouls Committed
        defensive_action_types = [
            'Pressure', 'Tackle', 'Interception', 'Block', 'Foul Committed', 
            'Challenge', 'Duel', 'Error'
        ]
        
        pressing_actions = df[
            (df['team'] == pressing_team) & 
            (df['type'].isin(defensive_action_types)) & 
            (df['x'] >= 40.0)
        ]
        pressing_actions_count = len(pressing_actions)
        
        if pressing_actions_count == 0:
            return 0.0
            
        ppda = opponent_passes_count / pressing_actions_count
        return round(ppda, 2)
