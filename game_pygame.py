import sys
import pygame

pygame.init()

WIDTH, HEIGHT = 800, 480
FPS = 60

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('Pickup & Attack Demo (pygame)')
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, 18)


class Player:
    def __init__(self, x, y, color, controls):
        self.x = x
        self.y = y
        self.size = 28
        self.color = pygame.Color(color)
        self.controls = controls
        self.speed = 3
        self.item = None
        self.hits_taken = 0
        self.health = 10
        self.alive = True
        self.spawn_x = x
        self.spawn_y = y
        self.respawn_at = None  # pygame ticks when to respawn

    def rect(self):
        return pygame.Rect(self.x - self.size/2, self.y - self.size/2, self.size, self.size)

    def update(self, keys):
        if not self.alive:
            return
        old_x, old_y = self.x, self.y
        if keys[self.controls['up']]:
            self.y -= self.speed
        if keys[self.controls['down']]:
            self.y += self.speed
        if keys[self.controls['left']]:
            self.x -= self.speed
        if keys[self.controls['right']]:
            self.x += self.speed

        # clamp to screen
        half = self.size/2
        self.x = max(half, min(WIDTH - half, self.x))
        self.y = max(half, min(HEIGHT - half, self.y))

        # collision with obstacles: if collides, revert to previous position
        try:
            for obs in obstacles:
                if obs.collides_rect(self.rect()):
                    self.x, self.y = old_x, old_y
                    break
        except NameError:
            # obstacles may not be defined yet at load time
            pass

    def draw(self, surf):
        if not self.alive:
            return
        pygame.draw.rect(surf, self.color, self.rect())

        # draw item indicator
        if self.item:
            # small rect above player colored by item
            pygame.draw.rect(surf, pygame.Color(self.item.type['color']), (self.x - 8, self.y - self.size/2 - 14, 16, 10))
            text = f"{self.item.type['name']} ({self.item.uses_left})"
            img = font.render(text, True, (0,0,0))
            surf.blit(img, (self.x - 28, self.y - self.size/2 - 36))

        # draw health bar
        bar_w, bar_h = 40, 6
        px = self.x - bar_w/2
        py = self.y + self.size/2 + 6
        pygame.draw.rect(surf, (0,0,0), (px, py, bar_w, bar_h), 1)
        remaining = max(0, self.health/10)
        if remaining > 0.5:
            col = (76,175,80)
        elif remaining > 0.2:
            col = (255,152,0)
        else:
            col = (244,67,54)
        pygame.draw.rect(surf, col, (px, py, int(bar_w * remaining), bar_h))
        # numeric health
        img = font.render(f'HP: {self.health}', True, (0,0,0))
        surf.blit(img, (px, py - 14))

    def take_damage(self, amount):
        if not self.alive:
            return
        self.health = max(0, self.health - amount)
        if self.health <= 0:
            self.alive = False
            # respawn will be scheduled by the main loop when death is detected


class Item:
    def __init__(self, x, y, item_type):
        self.x = x
        self.y = y
        self.size = 14
        self.picked = False
        self.type = item_type
        self.uses_left = item_type['uses']

    def rect(self):
        return pygame.Rect(self.x - self.size/2, self.y - self.size/2, self.size, self.size)

    def draw(self, surf):
        if self.picked:
            return
        color = pygame.Color(self.type['color'])
        if self.type['shape'] == 'square':
            pygame.draw.rect(surf, color, self.rect())
        else:
            pygame.draw.circle(surf, color, (int(self.x), int(self.y)), int(self.size/2))
        pygame.draw.rect(surf, (0,0,0), (self.x - 2, self.y - 2, 4, 4))


class HeldWeapon:
    def __init__(self, item_type, uses_left):
        self.type = item_type
        self.uses_left = uses_left


class Attack:
    def __init__(self, owner, x, y, ttl, damage):
        self.owner = owner
        self.x = x
        self.y = y
        self.ttl = ttl
        self.damage = damage

    def rect(self):
        return pygame.Rect(self.x - 8, self.y - 8, 16, 16)

    def update(self):
        self.ttl -= 1

    def draw(self, surf):
        pygame.draw.circle(surf, (0,0,0), (int(self.x), int(self.y)), 8)


class CircleObstacle:
    def __init__(self, x, y, radius, color=(100,100,100)):
        self.x = x
        self.y = y
        self.r = radius
        self.color = color

    def draw(self, surf):
        pygame.draw.circle(surf, self.color, (int(self.x), int(self.y)), int(self.r))

    def collides_rect(self, rect: pygame.Rect):
        # closest point on rect to circle center
        closest_x = max(rect.left, min(self.x, rect.right))
        closest_y = max(rect.top, min(self.y, rect.bottom))
        dx = closest_x - self.x
        dy = closest_y - self.y
        return dx*dx + dy*dy < (self.r*self.r)


class PolyObstacle:
    def __init__(self, points, color=(140,140,140)):
        self.points = points  # list of (x,y)
        self.color = color

    def draw(self, surf):
        pygame.draw.polygon(surf, self.color, self.points)

    def collides_rect(self, rect: pygame.Rect):
        # approximate: check if any rect corner inside polygon or any poly segment intersects rect
        from pygame import Rect
        import math
        # rect corners
        corners = [(rect.left, rect.top),(rect.right, rect.top),(rect.right, rect.bottom),(rect.left, rect.bottom)]
        if point_in_poly(corners[0], self.points) or point_in_poly(corners[1], self.points) or point_in_poly(corners[2], self.points) or point_in_poly(corners[3], self.points):
            return True
        # check segment intersection
        for i in range(len(self.points)):
            a = self.points[i]
            b = self.points[(i+1)%len(self.points)]
            if rect_segment_intersect(rect, a, b):
                return True
        return False


def point_in_poly(point, poly):
    # ray casting algorithm
    x, y = point
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def rect_segment_intersect(rect: pygame.Rect, a, b):
    # check if segment ab intersects any of the 4 rect sides
    segments = [((rect.left, rect.top),(rect.right, rect.top)),((rect.right, rect.top),(rect.right, rect.bottom)),((rect.right, rect.bottom),(rect.left, rect.bottom)),((rect.left, rect.bottom),(rect.left, rect.top))]
    for s in segments:
        if segments_intersect(a, b, s[0], s[1]):
            return True
    return False


def segments_intersect(p1, p2, p3, p4):
    # helper for segment intersection
    def ccw(a,b,c):
        return (c[1]-a[1])*(b[0]-a[0]) > (b[1]-a[1])*(c[0]-a[0])
    return (ccw(p1,p3,p4) != ccw(p2,p3,p4)) and (ccw(p1,p2,p3) != ccw(p1,p2,p4))



# Item type definitions (same as JS version)
ITEM_TYPES = [
    {'name':'Stick','color':'#8d6e63','shape':'square','damage':1,'uses':5},
    {'name':'Dagger','color':'#9e9e9e','shape':'circle','damage':2,'uses':5},
    {'name':'Sword','color':'#90caf9','shape':'square','damage':3,'uses':4},
    {'name':'Axe','color':'#ef9a9a','shape':'circle','damage':4,'uses':3},
    {'name':'Spear','color':'#c5e1a5','shape':'square','damage':2,'uses':6},
    {'name':'Club','color':'#a1887f','shape':'square','damage':2,'uses':5},
    {'name':'Mace','color':'#ffcc80','shape':'circle','damage':3,'uses':4},
    {'name':'Wand','color':'#b39ddb','shape':'circle','damage':1,'uses':8},
    {'name':'Hammer','color':'#ffab91','shape':'square','damage':4,'uses':2},
    {'name':'Sickle','color':'#cfd8dc','shape':'circle','damage':2,'uses':5},
    {'name':'Greatsword','color':'#b0bec5','shape':'square','damage':5,'uses':2},
]

spawn_positions = [
    (120,80),(220,140),(320,200),(420,260),(520,320),(620,120),(720,200),(180,360),(480,80),(560,420),(360,360)
]

items = []
for i, pos in enumerate(spawn_positions):
    if i < len(ITEM_TYPES):
        items.append(Item(pos[0], pos[1], ITEM_TYPES[i]))

# create obstacles: mix of circles and polygons
obstacles = []
obstacles.append(CircleObstacle(400, 120, 50, (180,180,180)))
obstacles.append(CircleObstacle(200, 240, 40, (160,160,200)))
obstacles.append(PolyObstacle([(500,50),(580,80),(560,140),(480,110)], (150,200,150)))
obstacles.append(PolyObstacle([(120,300),(160,330),(140,380),(100,360)], (200,160,160)))


player1 = Player(100, 100, '#2196f3', {'up':pygame.K_w,'down':pygame.K_s,'left':pygame.K_a,'right':pygame.K_d,'use':pygame.K_f})
player2 = Player(700, 380, '#e91e63', {'up':pygame.K_UP,'down':pygame.K_DOWN,'left':pygame.K_LEFT,'right':pygame.K_RIGHT,'use':pygame.K_l})

attacks = []

def rects_overlap(a: pygame.Rect, b: pygame.Rect):
    return a.colliderect(b)

running = True
while running:
    dt = clock.tick(FPS)
    now = pygame.time.get_ticks()

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            # Player 1 pick/use (single-trigger on keydown)
            if event.key == player1.controls['use']:
                # if holding an Item (not combined) and another item is underfoot, combine
                if player1.item and isinstance(player1.item, Item):
                    combined = False
                    for it in items:
                        if not it.picked and rects_overlap(it.rect(), player1.rect()):
                            # combine first (player1.item) and this it
                            first = player1.item.type
                            second = it.type
                            combined_type = {
                                'name': f"{first['name']}_{second['name']}",
                                'color': first['color'],
                                'shape': first['shape'],
                                'damage': first['damage'] + second['damage'],
                                'uses': first['uses']
                            }
                            it.picked = True
                            # create held weapon with uses same as first's remaining
                            uses_left = player1.item.uses_left
                            player1.item = HeldWeapon(combined_type, uses_left)
                            combined = True
                            break
                    if not combined:
                        # no second item to combine -> use the held item
                        attacks.append(Attack(player1, player1.x + player1.size, player1.y, 8, player1.item.type['damage']))
                        player1.item.uses_left -= 1
                        if player1.item.uses_left <= 0:
                            player1.item = None
                elif player1.item and isinstance(player1.item, HeldWeapon):
                    # use combined weapon
                    attacks.append(Attack(player1, player1.x + player1.size, player1.y, 8, player1.item.type['damage']))
                    player1.item.uses_left -= 1
                    if player1.item.uses_left <= 0:
                        player1.item = None
                else:
                    # pick up an item overlapping (first pick)
                    for it in items:
                        if not it.picked and rects_overlap(it.rect(), player1.rect()):
                            it.picked = True
                            player1.item = it
                            break

            # Player 2 pick/use
            if event.key == player2.controls['use']:
                if player2.item and isinstance(player2.item, Item):
                    combined = False
                    for it in items:
                        if not it.picked and rects_overlap(it.rect(), player2.rect()):
                            first = player2.item.type
                            second = it.type
                            combined_type = {
                                'name': f"{first['name']}_{second['name']}",
                                'color': first['color'],
                                'shape': first['shape'],
                                'damage': first['damage'] + second['damage'],
                                'uses': first['uses']
                            }
                            it.picked = True
                            uses_left = player2.item.uses_left
                            player2.item = HeldWeapon(combined_type, uses_left)
                            combined = True
                            break
                    if not combined:
                        attacks.append(Attack(player2, player2.x - player2.size, player2.y, 8, player2.item.type['damage']))
                        player2.item.uses_left -= 1
                        if player2.item.uses_left <= 0:
                            player2.item = None
                elif player2.item and isinstance(player2.item, HeldWeapon):
                    attacks.append(Attack(player2, player2.x - player2.size, player2.y, 8, player2.item.type['damage']))
                    player2.item.uses_left -= 1
                    if player2.item.uses_left <= 0:
                        player2.item = None
                else:
                    for it in items:
                        if not it.picked and rects_overlap(it.rect(), player2.rect()):
                            it.picked = True
                            player2.item = it
                            break

    keys = pygame.key.get_pressed()
    player1.update(keys)
    player2.update(keys)

    # resolve attacks
    for a in attacks:
        a.update()
        target = player2 if a.owner is player1 else player1
        if target.alive:
            if rects_overlap(a.rect(), target.rect()):
                dmg = a.damage or 1
                target.take_damage(dmg)
                a.ttl = 0

    # remove expired attacks
    attacks = [a for a in attacks if a.ttl > 0]

    # handle death: schedule respawn and drop carried items
    for p in (player1, player2):
        if not p.alive and p.respawn_at is None:
            # schedule respawn in 5 seconds
            p.respawn_at = now + 5000
            # drop carried item if any
            if p.item:
                # if HeldWeapon or Item, create ground Item preserving uses
                typ = p.item.type
                uses_left = getattr(p.item, 'uses_left', getattr(p.item, 'uses_left', 0))
                dropped = Item(p.x + (20 if p is player1 else -20), p.y, typ)
                dropped.uses_left = uses_left
                items.append(dropped)
                p.item = None

    # respawn if time reached
    for p in (player1, player2):
        if not p.alive and p.respawn_at is not None and now >= p.respawn_at:
            p.alive = True
            p.health = 10
            p.x = p.spawn_x
            p.y = p.spawn_y
            p.respawn_at = None

    # draw
    screen.fill((245,245,245))
    # draw obstacles
    for obs in obstacles:
        obs.draw(screen)

    for it in items:
        it.draw(screen)
    player1.draw(screen)
    player2.draw(screen)
    for a in attacks:
        a.draw(screen)

    # draw dead messages
    if not player1.alive:
        img = font.render('Player 1 is dead (spectator)', True, (0,0,0))
        screen.blit(img, (10, 10))
    if not player2.alive:
        img = font.render('Player 2 is dead (spectator)', True, (0,0,0))
        screen.blit(img, (WIDTH - 220, 10))

    # Draw scoreboard top-right
    sb_x = WIDTH - 200
    sb_y = 10
    sb_w = 190
    sb_h = 64
    pygame.draw.rect(screen, (220,220,220), (sb_x, sb_y, sb_w, sb_h))
    pygame.draw.rect(screen, (0,0,0), (sb_x, sb_y, sb_w, sb_h), 1)

    # Player 1 status
    p1_text = f"Player 1: HP {player1.health if player1.alive else 0}"
    if not player1.alive and player1.respawn_at is not None:
        remaining_ms = max(0, player1.respawn_at - now)
        p1_text += f" (respawn {int(remaining_ms/1000)+1}s)"
    img1 = font.render(p1_text, True, (0,0,0))
    screen.blit(img1, (sb_x + 8, sb_y + 8))

    # Player 2 status
    p2_text = f"Player 2: HP {player2.health if player2.alive else 0}"
    if not player2.alive and player2.respawn_at is not None:
        remaining_ms = max(0, player2.respawn_at - now)
        p2_text += f" (respawn {int(remaining_ms/1000)+1}s)"
    img2 = font.render(p2_text, True, (0,0,0))
    screen.blit(img2, (sb_x + 8, sb_y + 32))

    pygame.display.flip()

pygame.quit()
sys.exit()
