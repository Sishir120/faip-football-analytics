import io
import base64
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from mplsoccer import Pitch
import plotly.graph_objects as go

class VizService:
    @staticmethod
    def _fig_to_base64(fig) -> str:
        """Helper to convert matplotlib figure to base64 PNG string."""
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor="#0e1117")
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode("utf-8")
        plt.close(fig)
        return img_str

    @classmethod
    def generate_shot_map(cls, events: list, team: str) -> str:
        """Generates a shot map for a team. Returns base64 PNG string."""
        df = pd.DataFrame(events)
        
        # Draw Pitch
        pitch = Pitch(
            pitch_type='statsbomb', 
            pitch_color='#0e1117', 
            line_color='#c1c9d2', 
            goal_type='line'
        )
        fig, ax = pitch.draw(figsize=(10, 7))
        fig.patch.set_facecolor('#0e1117')
        
        # Filter shots for team
        shots = df[(df['type'] == 'Shot') & (df['team'] == team)].copy()
        
        if shots.empty:
            ax.text(60, 40, f"No shots recorded for\n{team}", 
                    color='#ffffff', size=20, ha='center', va='center', weight='bold')
            return cls._fig_to_base64(fig)
        
        # Parse outcomes and styles
        colors = []
        sizes = []
        
        for _, row in shots.iterrows():
            outcome = row.get('outcome') or ""
            xg = row.get('xg') or 0.01
            
            # Map size based on xG (scaled)
            size = max(40.0, min(1000.0, xg * 700.0))
            sizes.append(size)
            
            # Map colors: Goal=green, Saved=yellow, Blocked=grey, Missed/OffTarget=red
            outcome_lower = outcome.lower()
            if "goal" in outcome_lower:
                colors.append("#00ff88")  # Neon green
            elif "saved" in outcome_lower:
                colors.append("#ffcc00")  # Yellow/Orange
            elif "blocked" in outcome_lower:
                colors.append("#7f7f7f")  # Grey
            else:
                colors.append("#ff4a4a")  # Red (off target, post, etc.)
                
        # Scatter shots
        pitch.scatter(
            shots['x'], 
            shots['y'], 
            s=sizes, 
            c=colors, 
            edgecolors='#ffffff', 
            linewidths=1.0, 
            alpha=0.85, 
            ax=ax
        )
        
        # Set Title
        ax.set_title(f"{team} Shot Map", color='#ffffff', fontsize=18, pad=10, weight='bold')
        
        # Draw custom legend
        legend_labels = ['Goal', 'Saved', 'Blocked', 'Missed / Post']
        legend_colors = ['#00ff88', '#ffcc00', '#7f7f7f', '#ff4a4a']
        
        for idx, (label, color) in enumerate(zip(legend_labels, legend_colors)):
            ax.scatter([], [], c=color, alpha=0.85, s=100, label=label, edgecolors='#ffffff')
            
        legend = ax.legend(
            loc='lower left', 
            scatterpoints=1, 
            frameon=True, 
            facecolor='#0e1117', 
            edgecolor='#c1c9d2',
            fontsize=10
        )
        for text in legend.get_texts():
            text.set_color('#ffffff')
            
        return cls._fig_to_base64(fig)

    @classmethod
    def generate_pass_map(cls, events: list, player: str = None, team: str = None) -> str:
        """Generates a pass map. Returns base64 PNG string."""
        df = pd.DataFrame(events)
        
        pitch = Pitch(
            pitch_type='statsbomb', 
            pitch_color='#0e1117', 
            line_color='#c1c9d2', 
            goal_type='line'
        )
        fig, ax = pitch.draw(figsize=(10, 7))
        fig.patch.set_facecolor('#0e1117')
        
        # Filter passes
        passes = df[df['type'] == 'Pass'].copy()
        
        if player:
            passes = passes[passes['player'] == player]
            title = f"Pass Map: {player}"
        elif team:
            passes = passes[passes['team'] == team]
            title = f"Pass Map: {team}"
        else:
            passes = pd.DataFrame()
            title = "Pass Map"
            
        if passes.empty:
            ax.text(60, 40, "No passes recorded", 
                    color='#ffffff', size=20, ha='center', va='center', weight='bold')
            return cls._fig_to_base64(fig)
            
        # Parse pass end locations
        end_x = []
        end_y = []
        valid_passes_idx = []
        
        for idx, row in passes.iterrows():
            details = row.get('details') or {}
            end_loc = details.get('pass_end_location')
            if isinstance(end_loc, list) and len(end_loc) >= 2:
                end_x.append(end_loc[0])
                end_y.append(end_loc[1])
                valid_passes_idx.append(idx)
                
        passes = passes.loc[valid_passes_idx].copy()
        passes['end_x'] = end_x
        passes['end_y'] = end_y
        
        # Color based on pass outcome
        colors = []
        for _, row in passes.iterrows():
            outcome = row.get('outcome')
            if outcome is None or pd.isna(outcome):
                colors.append('#38bdf8')  # Sleek Sky Blue (Complete)
            else:
                colors.append('#ef4444')  # Red (Incomplete)
                
        # Draw Arrows
        pitch.arrows(
            passes['x'], passes['y'], 
            passes['end_x'], passes['end_y'], 
            color=colors, 
            width=1.5, 
            headwidth=3, 
            headlength=4, 
            ax=ax,
            alpha=0.7
        )
        
        # Set Title
        ax.set_title(title, color='#ffffff', fontsize=18, pad=10, weight='bold')
        
        # Add legend
        ax.scatter([], [], c='#38bdf8', s=100, label='Complete', edgecolors='#ffffff')
        ax.scatter([], [], c='#ef4444', s=100, label='Incomplete', edgecolors='#ffffff')
        legend = ax.legend(
            loc='lower left', 
            frameon=True, 
            facecolor='#0e1117', 
            edgecolor='#c1c9d2',
            fontsize=10
        )
        for text in legend.get_texts():
            text.set_color('#ffffff')
            
        return cls._fig_to_base64(fig)

    @classmethod
    def generate_heatmap(cls, events: list, player: str) -> str:
        """Generates a player touch heatmap. Returns base64 PNG string."""
        df = pd.DataFrame(events)
        
        pitch = Pitch(
            pitch_type='statsbomb', 
            pitch_color='#0e1117', 
            line_color='#c1c9d2', 
            goal_type='line'
        )
        fig, ax = pitch.draw(figsize=(10, 7))
        fig.patch.set_facecolor('#0e1117')
        
        # Filter player events with coordinates
        player_df = df[(df['player'] == player) & (df['x'].notna()) & (df['y'].notna())].copy()
        
        if player_df.empty:
            ax.text(60, 40, f"No touches recorded for\n{player}", 
                    color='#ffffff', size=20, ha='center', va='center', weight='bold')
            return cls._fig_to_base64(fig)
            
        if len(player_df) < 5:
            # Fallback to scatter if too few points for KDE
            pitch.scatter(
                player_df['x'], player_df['y'], 
                ax=ax, 
                color='#ffcc00', 
                s=120, 
                edgecolors='#ffffff', 
                alpha=0.8
            )
        else:
            # KDE plot
            pitch.kdeplot(
                player_df['x'], player_df['y'], 
                ax=ax, 
                cmap='hot', 
                fill=True, 
                alpha=0.65, 
                levels=100, 
                thresh=0.05
            )
            
        ax.set_title(f"{player} Touch Heatmap", color='#ffffff', fontsize=18, pad=10, weight='bold')
        return cls._fig_to_base64(fig)

    @classmethod
    def generate_xg_timeline(cls, events: list, home_team: str, away_team: str) -> dict:
        """Generates cumulative xG timeline data. Returns Plotly JSON-compatible dict."""
        df = pd.DataFrame(events)
        shots = df[df['type'] == 'Shot'].copy()
        
        # Parse match minute
        minutes = []
        seconds = []
        for _, row in shots.iterrows():
            details = row.get('details') or {}
            minutes.append(details.get('minute', 0))
            seconds.append(details.get('second', 0))
            
        shots['minute'] = minutes
        shots['second'] = seconds
        
        # Sort chronologically
        shots = shots.sort_values(by=['minute', 'second']).copy()
        
        # Compute cumulative xG
        home_time = [0]
        home_xg = [0.0]
        away_time = [0]
        away_xg = [0.0]
        
        home_goals = []
        away_goals = []
        
        curr_home_xg = 0.0
        curr_away_xg = 0.0
        
        for _, shot in shots.iterrows():
            minute = shot['minute']
            xg = shot['xg'] or 0.0
            is_goal = shot['outcome'] == 'Goal'
            team = shot['team']
            player = shot['player'] or "Unknown"
            
            if team == home_team:
                curr_home_xg += xg
                home_time.append(minute)
                home_xg.append(curr_home_xg)
                if is_goal:
                    home_goals.append((minute, curr_home_xg, player))
            else:
                curr_away_xg += xg
                away_time.append(minute)
                away_xg.append(curr_away_xg)
                if is_goal:
                    away_goals.append((minute, curr_away_xg, player))
                    
        # Pad with 90 min endpoint
        max_min = max(90, shots['minute'].max() if not shots.empty else 90)
        home_time.append(max_min)
        home_xg.append(curr_home_xg)
        away_time.append(max_min)
        away_xg.append(curr_away_xg)
        
        # Build Plotly interactive figure
        fig = go.Figure()
        
        # Add Home Team Line
        fig.add_trace(go.Scatter(
            x=home_time, 
            y=home_xg,
            mode='lines+markers',
            name=home_team,
            line=dict(color='#38bdf8', width=3, shape='hv'),
            marker=dict(size=4)
        ))
        
        # Add Away Team Line
        fig.add_trace(go.Scatter(
            x=away_time, 
            y=away_xg,
            mode='lines+markers',
            name=away_team,
            line=dict(color='#f43f5e', width=3, shape='hv'),
            marker=dict(size=4)
        ))
        
        # Add goal markers for Home Team
        for g_min, g_xg, g_player in home_goals:
            fig.add_annotation(
                x=g_min, y=g_xg,
                text=f"⚽ {g_player} ({g_min}')",
                showarrow=True,
                arrowhead=2,
                arrowcolor='#38bdf8',
                bgcolor='#0e1117',
                bordercolor='#38bdf8',
                font=dict(color='#ffffff', size=10)
            )
            
        # Add goal markers for Away Team
        for g_min, g_xg, g_player in away_goals:
            fig.add_annotation(
                x=g_min, y=g_xg,
                text=f"⚽ {g_player} ({g_min}')",
                showarrow=True,
                arrowhead=2,
                arrowcolor='#f43f5e',
                bgcolor='#0e1117',
                bordercolor='#f43f5e',
                font=dict(color='#ffffff', size=10)
            )
            
        # Style layout
        fig.update_layout(
            title=dict(
                text=f"xG Timeline: {home_team} ({curr_home_xg:.2f} xG) vs {away_team} ({curr_away_xg:.2f} xG)",
                font=dict(color='#ffffff', size=16),
                x=0.5
            ),
            paper_bgcolor='#0e1117',
            plot_bgcolor='#0e1117',
            xaxis=dict(
                title=dict(text="Match Minute", font=dict(color='#ffffff')),
                gridcolor='#2d3748',
                tickcolor='#718096',
                tickfont=dict(color='#ffffff'),
                range=[0, max_min + 2]
            ),
            yaxis=dict(
                title=dict(text="Cumulative Expected Goals (xG)", font=dict(color='#ffffff')),
                gridcolor='#2d3748',
                tickcolor='#718096',
                tickfont=dict(color='#ffffff')
            ),
            legend=dict(
                font=dict(color='#ffffff'),
                bgcolor='rgba(0,0,0,0)'
            ),
            margin=dict(l=40, r=40, t=50, b=40)
        )
        
        return fig.to_dict()

    @classmethod
    def generate_pass_network(cls, events: list, team: str) -> str:
        """Generates an average position pass network for a team. Returns base64 PNG string."""
        df = pd.DataFrame(events)
        
        pitch = Pitch(
            pitch_type='statsbomb', 
            pitch_color='#0e1117', 
            line_color='#c1c9d2', 
            goal_type='line'
        )
        fig, ax = pitch.draw(figsize=(10, 7))
        fig.patch.set_facecolor('#0e1117')
        
        # Filter passes for the team
        passes = df[(df['type'] == 'Pass') & (df['team'] == team)].copy()
        
        if passes.empty:
            ax.text(60, 40, f"No passes recorded for\n{team}", 
                    color='#ffffff', size=20, ha='center', va='center', weight='bold')
            return cls._fig_to_base64(fig)
            
        # Parse minutes and first substitution time
        minutes = passes['details'].apply(lambda x: x.get('minute') if isinstance(x, dict) else 0)
        passes['minute'] = minutes
        
        subs = df[(df['type'] == 'Substitution') & (df['team'] == team)].copy()
        if not subs.empty:
            subs['minute'] = subs['details'].apply(lambda x: x.get('minute') if isinstance(x, dict) else 0)
            first_sub_min = subs['minute'].min()
            passes = passes[passes['minute'] < first_sub_min].copy()
            
        if passes.empty:
            ax.text(60, 40, "No passes before substitution", 
                    color='#ffffff', size=16, ha='center', va='center', weight='bold')
            return cls._fig_to_base64(fig)
            
        # Recipient extraction
        passes['recipient'] = passes['details'].apply(
            lambda x: x.get('pass_recipient') if isinstance(x, dict) else None
        )
        
        # Drop rows without recipient or coordinates
        passes = passes.dropna(subset=['recipient', 'x', 'y']).copy()
        
        # Average positions of players (pass origin)
        avg_positions = passes.groupby('player').agg(
            x=('x', 'mean'),
            y=('y', 'mean'),
            count=('event_id', 'count')
        ).reset_index()
        
        # Pass counts between pairs (directional)
        pair_counts = passes.groupby(['player', 'recipient']).size().reset_index(name='pass_count')
        
        # Merge locations of player and recipient
        pair_counts = pair_counts.merge(
            avg_positions, left_on='player', right_on='player'
        ).rename(columns={'x': 'x_start', 'y': 'y_start'})
        
        pair_counts = pair_counts.merge(
            avg_positions, left_on='recipient', right_on='player'
        ).rename(columns={'x': 'x_end', 'y': 'y_end'})
        
        # Filter pairs with >= 3 passes
        pair_counts = pair_counts[pair_counts['pass_count'] >= 3].copy()
        
        # Plot networks
        if not pair_counts.empty:
            # Scale edges
            max_passes = pair_counts['pass_count'].max()
            for _, row in pair_counts.iterrows():
                # Line thickness relative to frequency
                linewidth = (row['pass_count'] / max_passes) * 6.0
                pitch.lines(
                    row['x_start'], row['y_start'],
                    row['x_end'], row['y_end'],
                    lw=linewidth,
                    color='#38bdf8',
                    ax=ax,
                    alpha=0.5,
                    zorder=1
                )
                
        # Plot player nodes (scaled by total passes)
        max_player_passes = avg_positions['count'].max()
        for _, row in avg_positions.iterrows():
            size = (row['count'] / max_player_passes) * 800.0 + 200.0
            pitch.scatter(
                row['x'], row['y'],
                s=size,
                color='#0e1117',
                edgecolors='#38bdf8',
                linewidths=2.5,
                ax=ax,
                zorder=2
            )
            
            # Print player initials or last name as label
            name_parts = row['player'].split()
            short_name = name_parts[-1] if name_parts else ""
            
            # Display name offset
            ax.text(
                row['x'], row['y'] - 3.5,
                short_name,
                color='#ffffff',
                size=9,
                ha='center',
                va='center',
                weight='bold',
                zorder=3,
                bbox=dict(facecolor='#0e1117', alpha=0.8, edgecolor='none', boxstyle='round,pad=0.2')
            )
            
        ax.set_title(f"{team} Pass Network (Before 1st Sub)", color='#ffffff', fontsize=18, pad=10, weight='bold')
        return cls._fig_to_base64(fig)
